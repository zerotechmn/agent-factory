import { query, type McpSdkServerConfigWithInstance, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { appendJsonl, writeJson, type StagePaths } from "./pipeline.artifacts";
import type { LedgerEntry, StageKey, StageSettings } from "./pipeline.types";

export type StageOutcome = "succeeded" | "failed" | "stopped_budget";

export type StageResult<Handoff> = {
  error: string | null;
  handoff: Handoff | null;
  ledger: LedgerEntry;
  outcome: StageOutcome;
  /** Lets a later stage resume this conversation (developer fix rounds). */
  sessionId: string | null;
};

export type RunStageInput<Schema extends z.ZodObject> = {
  allowanceUsd: number;
  allowedTools: string[];
  cwd: string;
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
  model: string;
  /** Sees every SDK message as it arrives (live task board). Must not throw. */
  onMessage?: (message: SDKMessage) => void;
  prompt: string;
  /** Renders REPORT.md from the handoff instead of asking the agent for prose. */
  renderReport?: (handoff: unknown) => string;
  /** Prompt to use if the resume falls back to a fresh session (which lacks the earlier context). */
  freshPrompt?: string;
  /** Continue this earlier session (forked, so its own transcript stays intact). */
  resumeSessionId?: string | null;
  runtime: "code" | "doc";
  schema: Schema;
  settings: StageSettings;
  skills: string[];
  stageKey: StageKey;
  stagePaths: StagePaths;
  systemPrompt: string;
};

/** Vendored engineering skills, loaded as a local plugin; see skills-plugin/NOTICE.md. */
const SKILLS_PLUGIN_DIR = fileURLToPath(new URL("../../skills-plugin", import.meta.url));

// Every agent returns its handoff plus a human-readable report. The runner
// splits them: the report goes to REPORT.md for people, the rest to
// handoff.json for the next agent.
const reportField = z
  .string()
  .describe(
    "Human-readable Markdown report of what you did and decided, for auditors. Start with a level-1 heading. Do not include the full source code.",
  );

export async function runStage<Schema extends z.ZodObject>(
  input: RunStageInput<Schema>,
): Promise<StageResult<z.infer<Schema>>> {
  const { stagePaths } = input;
  await mkdir(stagePaths.dir, { recursive: true });

  const outputSchema = input.renderReport ? input.schema : input.schema.extend({ reportMarkdown: reportField });
  const startedAt = Date.now();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), input.settings.timeoutMs);
  const usage = new UsageTracker(input.model);

  const baseMeta = {
    allowanceUsd: input.allowanceUsd,
    allowedTools: input.allowedTools,
    effort: input.settings.effort,
    maxTurns: input.settings.maxTurns,
    model: input.model,
    resumedFrom: input.resumeSessionId ?? null,
    runtime: input.runtime,
    skills: input.skills,
    stageKey: input.stageKey,
    startedAt: new Date(startedAt).toISOString(),
  };
  await writeJson(stagePaths.meta, baseMeta);
  await writeFile(`${stagePaths.dir}/input-prompt.md`, input.prompt);

  let sessionId: string | null = null;
  let resumeFellBack = false;

  type Attempt = {
    /** Structured output the SDK confirmed ("provided successfully"), even if the run was stopped afterwards. */
    accepted: unknown;
    result: ResultMessage | null;
    sawAssistant: boolean;
    thrown: string | null;
  };
  const consume = async (resume: string | null): Promise<Attempt> => {
    let result: ResultMessage | null = null;
    let thrown: string | null = null;
    let sawAssistant = false;
    const output = new StructuredOutputTracker();
    try {
      const stream = query({
        options: {
          abortController,
          allowedTools: input.skills.length > 0 ? [...input.allowedTools, "Skill"] : input.allowedTools,
          cwd: input.cwd,
          effort: input.settings.effort,
          ...(resume ? { forkSession: true, resume } : {}),
          maxBudgetUsd: input.allowanceUsd,
          maxTurns: input.settings.maxTurns,
          mcpServers: input.mcpServers,
          model: input.model,
          outputFormat: { schema: toOutputSchema(outputSchema), type: "json_schema" },
          // Deny anything not in allowedTools instead of waiting for a human.
          permissionMode: "dontAsk",
          plugins: [{ path: SKILLS_PLUGIN_DIR, type: "local" }],
          // Ignore any settings/CLAUDE.md on the host so runs are reproducible.
          settingSources: [],
          // Only this stage's skills are listed to the model; an empty list hides all of them.
          skills: input.skills,
          systemPrompt:
            input.runtime === "doc"
              ? input.systemPrompt
              : { append: input.systemPrompt, preset: "claude_code", type: "preset" },
        },
        prompt: resume ? input.prompt : (input.freshPrompt ?? input.prompt),
      });

      for await (const message of stream) {
        await appendJsonl(stagePaths.transcript, message);
        usage.observe(message);
        if ("session_id" in message && typeof message.session_id === "string") sessionId = message.session_id;
        output.observe(message);
        input.onMessage?.(message);
        if (message.type === "assistant") sawAssistant = true;
        if (message.type === "result") result = message;
      }
    } catch (error) {
      thrown = abortController.signal.aborted
        ? `Stage timed out after ${Math.round(input.settings.timeoutMs / 60_000)} min`
        : error instanceof Error
          ? error.message
          : String(error);
    }
    return { accepted: output.accepted, result, sawAssistant, thrown };
  };

  let attempt: Attempt;
  try {
    attempt = await consume(input.resumeSessionId ?? null);
    const failed = attempt.result?.subtype !== "success";
    // A resume that dies before the model says anything (session file gone,
    // incompatible history) is a plumbing failure, not the agent's: retry once
    // as a fresh session rather than burning a fix round.
    if (input.resumeSessionId && failed && !attempt.sawAssistant && !abortController.signal.aborted) {
      resumeFellBack = true;
      await appendJsonl(stagePaths.transcript, { note: "resume failed; retrying as a fresh session", type: "factory" });
      attempt = await consume(null);
    }
  } finally {
    clearTimeout(timeout);
  }
  const { accepted, result, thrown } = attempt;

  const ledger: LedgerEntry = {
    ...usage.totals(result),
    durationMs: Date.now() - startedAt,
    outcome: result?.subtype ?? "aborted",
    stageDir: stagePaths.dirName,
    stageKey: input.stageKey,
    timestamp: new Date().toISOString(),
  };

  let salvagedAfterBudgetStop = false;
  const finish = async (outcome: StageOutcome, handoff: z.infer<Schema> | null, error: string | null) => {
    await writeJson(stagePaths.meta, {
      ...baseMeta,
      salvagedAfterBudgetStop,
      costUsd: ledger.costUsd,
      durationMs: ledger.durationMs,
      error,
      outcome,
      resumeFellBack,
      sdkOutcome: ledger.outcome,
      sessionId,
      tokens: {
        cacheCreationInput: ledger.cacheCreationInputTokens,
        cacheReadInput: ledger.cacheReadInputTokens,
        input: ledger.inputTokens,
        output: ledger.outputTokens,
      },
    });
    return { error, handoff, ledger, outcome, sessionId };
  };

  const accept = async (data: unknown) => {
    const parsed = outputSchema.safeParse(data);
    if (!parsed.success) return null;
    // Generic `.extend` loses the field types; the schema above guarantees this shape.
    const { reportMarkdown, ...handoff } = parsed.data as Record<string, unknown> & { reportMarkdown?: string };
    const report = input.renderReport ? input.renderReport(handoff) : (reportMarkdown ?? "");
    await writeFile(stagePaths.report, `${report.trim()}\n`);
    await writeJson(stagePaths.handoff, handoff);
    return finish("succeeded", handoff as z.infer<Schema>, null);
  };

  if (result?.subtype === "error_max_budget_usd") {
    // The SDK checks the budget only after a turn completes, so the turn that
    // delivers the final answer can itself cross the limit. A complete, valid
    // answer the SDK already accepted is kept: the money is spent either way.
    if (accepted !== undefined) {
      salvagedAfterBudgetStop = true;
      const kept = await accept(accepted);
      if (kept) {
        console.info("[stage] kept output delivered in the turn that crossed the budget", { stage: stagePaths.dirName });
        return kept;
      }
      salvagedAfterBudgetStop = false;
    }
    const error = `Stage hit its $${input.allowanceUsd.toFixed(2)} allowance and was stopped.`;
    await writeFile(stagePaths.report, failureReport(input.settings.label, error));
    return finish("stopped_budget", null, error);
  }

  if (!result || result.subtype !== "success" || result.is_error) {
    const error = thrown ?? (result && "errors" in result ? result.errors.join("; ") : null) ?? `Agent ended with ${ledger.outcome}`;
    await writeFile(stagePaths.report, failureReport(input.settings.label, error));
    return finish("failed", null, error);
  }

  const kept = await accept(result.structured_output);
  if (kept) return kept;
  const parsed = outputSchema.safeParse(result.structured_output);
  const error = `Structured output did not match schema: ${parsed.error?.message ?? "unknown"}`;
  await writeFile(stagePaths.report, failureReport(input.settings.label, error));
  return finish("failed", null, error);
}

type ResultMessage = Extract<SDKMessage, { type: "result" }>;

/** The tool the SDK gives the model for submitting outputFormat answers. */
const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

/**
 * Watches the message stream for an answer the SDK accepted: a
 * StructuredOutput tool call followed by a non-error result for that call.
 * A rejected submission (schema error) doesn't count; the latest accepted one wins.
 */
export class StructuredOutputTracker {
  accepted: unknown = undefined;
  private readonly submitted = new Map<string, unknown>();

  observe(message: SDKMessage): void {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === STRUCTURED_OUTPUT_TOOL) this.submitted.set(block.id, block.input);
      }
    }
    if (message.type === "user" && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === "tool_result" && !block.is_error && this.submitted.has(block.tool_use_id)) {
          this.accepted = this.submitted.get(block.tool_use_id);
        }
      }
    }
  }
}

function toOutputSchema(schema: z.ZodObject): Record<string, unknown> {
  // The CLI's validator rejects zod's "$schema" draft-2020-12 marker; the schema body is fine without it.
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function failureReport(label: string, error: string): string {
  return `# ${label} — did not complete\n\n${error}\n\nSee \`transcript.jsonl\` in this folder for the full agent trace.\n`;
}

// Fallback list prices (USD per million tokens), used only when the SDK never
// returned a result message (timeout/crash) and so gave us no cost figure.
const FALLBACK_PRICES: Record<string, { cacheRead: number; cacheWrite: number; input: number; output: number }> = {
  "claude-opus-5-5": { cacheRead: 0.2, cacheWrite: 5, input: 4, output: 20 },
  "claude-sonnet-5-5": { cacheRead: 0.2, cacheWrite: 2.5, input: 2, output: 10 },
};

type UsageTotals = Pick<
  LedgerEntry,
  "cacheCreationInputTokens" | "cacheReadInputTokens" | "costUsd" | "inputTokens" | "outputTokens"
>;

class UsageTracker {
  private readonly seen = new Set<string>();
  private running: Omit<UsageTotals, "costUsd"> = {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  constructor(private readonly model: string) {}

  observe(message: SDKMessage): void {
    if (message.type !== "assistant") return;
    // One API response can arrive as several assistant messages (one per block)
    // sharing the same id; count its usage once.
    const id = message.message.id;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    const u = message.message.usage;
    this.running = {
      cacheCreationInputTokens: this.running.cacheCreationInputTokens + Number(u?.cache_creation_input_tokens ?? 0),
      cacheReadInputTokens: this.running.cacheReadInputTokens + Number(u?.cache_read_input_tokens ?? 0),
      inputTokens: this.running.inputTokens + Number(u?.input_tokens ?? 0),
      outputTokens: this.running.outputTokens + Number(u?.output_tokens ?? 0),
    };
  }

  totals(result: Extract<SDKMessage, { type: "result" }> | null): UsageTotals {
    if (result) {
      // modelUsage covers subagents and internal calls too, so prefer it.
      const all = Object.values(result.modelUsage ?? {});
      if (all.length > 0) {
        return {
          cacheCreationInputTokens: sum(all.map((m) => m.cacheCreationInputTokens)),
          cacheReadInputTokens: sum(all.map((m) => m.cacheReadInputTokens)),
          costUsd: Number(result.total_cost_usd ?? 0),
          inputTokens: sum(all.map((m) => m.inputTokens)),
          outputTokens: sum(all.map((m) => m.outputTokens)),
        };
      }
      return { ...this.running, costUsd: Number(result.total_cost_usd ?? 0) };
    }

    const price = FALLBACK_PRICES[this.model] ?? FALLBACK_PRICES["claude-opus-5-5"]!;
    const costUsd =
      (this.running.inputTokens * price.input +
        this.running.outputTokens * price.output +
        this.running.cacheReadInputTokens * price.cacheRead +
        this.running.cacheCreationInputTokens * price.cacheWrite) /
      1_000_000;
    return { ...this.running, costUsd };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}
