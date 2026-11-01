import { query, type McpSdkServerConfigWithInstance, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

import { appendJsonl, writeJson, type StagePaths } from "./pipeline.artifacts";
import type { LedgerEntry, StageKey, StageSettings } from "./pipeline.types";

export type StageOutcome = "succeeded" | "failed" | "stopped_budget";

export type StageResult<Handoff> = {
  error: string | null;
  handoff: Handoff | null;
  ledger: LedgerEntry;
  outcome: StageOutcome;
};

export type RunStageInput<Schema extends z.ZodObject> = {
  allowanceUsd: number;
  allowedTools: string[];
  cwd: string;
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
  model: string;
  prompt: string;
  schema: Schema;
  settings: StageSettings;
  stageKey: StageKey;
  stagePaths: StagePaths;
  systemPrompt: string;
};

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

  const outputSchema = input.schema.extend({ reportMarkdown: reportField });
  const startedAt = Date.now();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), input.settings.timeoutMs);
  const usage = new UsageTracker(input.model);

  await writeJson(stagePaths.meta, {
    allowanceUsd: input.allowanceUsd,
    allowedTools: input.allowedTools,
    effort: input.settings.effort,
    maxTurns: input.settings.maxTurns,
    model: input.model,
    stageKey: input.stageKey,
    startedAt: new Date(startedAt).toISOString(),
  });
  await writeFile(`${stagePaths.dir}/input-prompt.md`, input.prompt);

  let result: Extract<SDKMessage, { type: "result" }> | null = null;
  let thrown: string | null = null;

  try {
    const stream = query({
      options: {
        abortController,
        allowedTools: input.allowedTools,
        cwd: input.cwd,
        effort: input.settings.effort,
        maxBudgetUsd: input.allowanceUsd,
        maxTurns: input.settings.maxTurns,
        mcpServers: input.mcpServers,
        model: input.model,
        outputFormat: { schema: toOutputSchema(outputSchema), type: "json_schema" },
        // Deny anything not in allowedTools instead of waiting for a human.
        permissionMode: "dontAsk",
        // Ignore any settings/CLAUDE.md on the host so runs are reproducible.
        settingSources: [],
        systemPrompt: { append: input.systemPrompt, preset: "claude_code", type: "preset" },
      },
      prompt: input.prompt,
    });

    for await (const message of stream) {
      await appendJsonl(stagePaths.transcript, message);
      usage.observe(message);
      if (message.type === "result") result = message;
    }
  } catch (error) {
    thrown = abortController.signal.aborted
      ? `Stage timed out after ${Math.round(input.settings.timeoutMs / 60_000)} min`
      : error instanceof Error
        ? error.message
        : String(error);
  } finally {
    clearTimeout(timeout);
  }

  const ledger: LedgerEntry = {
    ...usage.totals(result),
    durationMs: Date.now() - startedAt,
    outcome: result?.subtype ?? "aborted",
    stageDir: stagePaths.dirName,
    stageKey: input.stageKey,
    timestamp: new Date().toISOString(),
  };

  const finish = async (outcome: StageOutcome, handoff: z.infer<Schema> | null, error: string | null) => {
    await writeJson(stagePaths.meta, {
      allowanceUsd: input.allowanceUsd,
      allowedTools: input.allowedTools,
      costUsd: ledger.costUsd,
      durationMs: ledger.durationMs,
      effort: input.settings.effort,
      error,
      maxTurns: input.settings.maxTurns,
      model: input.model,
      outcome,
      sdkOutcome: ledger.outcome,
      stageKey: input.stageKey,
      startedAt: new Date(startedAt).toISOString(),
      tokens: {
        cacheCreationInput: ledger.cacheCreationInputTokens,
        cacheReadInput: ledger.cacheReadInputTokens,
        input: ledger.inputTokens,
        output: ledger.outputTokens,
      },
    });
    return { error, handoff, ledger, outcome };
  };

  if (result?.subtype === "error_max_budget_usd") {
    const error = `Stage hit its $${input.allowanceUsd.toFixed(2)} allowance and was stopped.`;
    await writeFile(stagePaths.report, failureReport(input.settings.label, error));
    return finish("stopped_budget", null, error);
  }

  if (!result || result.subtype !== "success" || result.is_error) {
    const error = thrown ?? (result && "errors" in result ? result.errors.join("; ") : null) ?? `Agent ended with ${ledger.outcome}`;
    await writeFile(stagePaths.report, failureReport(input.settings.label, error));
    return finish("failed", null, error);
  }

  const parsed = outputSchema.safeParse(result.structured_output);
  if (!parsed.success) {
    const error = `Structured output did not match schema: ${parsed.error.message}`;
    await writeFile(stagePaths.report, failureReport(input.settings.label, error));
    return finish("failed", null, error);
  }

  // Generic `.extend` loses the field types; the schema above guarantees this shape.
  const { reportMarkdown, ...handoff } = parsed.data as Record<string, unknown> & { reportMarkdown: string };
  await writeFile(stagePaths.report, `${reportMarkdown.trim()}\n`);
  await writeJson(stagePaths.handoff, handoff);
  return finish("succeeded", handoff as z.infer<Schema>, null);
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
