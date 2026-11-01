import { writeFile } from "node:fs/promises";

import { AGENTS } from "../agents/agents.registry";
import { systemPromptFor, type StageContext } from "../agents/agents.shared";
import { config } from "../lib/config";
import { callDeployer } from "../lib/deployer";
import * as RunsStore from "../runs/runs.store";
import {
  appendLedger,
  commitWorkspace,
  headCommit,
  initRunDir,
  runPaths,
  stagePaths,
  workspaceHasFile,
  writeJson,
  type RunPaths,
} from "./pipeline.artifacts";
import { commitAllowance, createBudget, decideAllowance, recordSpend, type Budget } from "./pipeline.budget";
import {
  APP_PORT,
  DEPLOY_RESERVE_USD,
  FIX_BUDGET_USD,
  FIX_SKILLS,
  MAX_FIX_ATTEMPTS,
  STAGE_SETTINGS,
  VERIFY_LABEL,
} from "./pipeline.constants";
import { runGate, type GateMode, type GateResult, type SmokeCheck } from "./pipeline.gate";
import { runStage, type StageOutcome } from "./pipeline.stage-runner";
import type { AgentStageKey, RunStatus } from "./pipeline.types";

type StepOutcome = StageOutcome | "not_started";
type StepResult = { handoff: unknown; outcome: StepOutcome; sessionId: string | null };

type StepOptions = {
  budgetUsd?: number;
  fix?: StageContext["fix"];
  gate?: GateResult | null;
  rereview?: StageContext["rereview"];
  resumeSessionId?: string | null;
  skills?: string[];
  suffix?: string;
};

type ReviewHandoff = { blocking: boolean; findings: unknown[] };
type TriageHandoff = { appBugs: unknown[]; passed: boolean };
type Commands = { install: string; test: string };

/** Agents that edit the workspace get a git commit afterwards so diffs per agent are inspectable. */
const WORKSPACE_STAGES = new Set<AgentStageKey>(["development", "testing", "deployment"]);

/**
 * Runs the whole factory for one prompt. Never throws: every outcome ends in
 * a terminal run status plus SUMMARY.md, so a failed run is still inspectable.
 */
export async function executeRun({ id, prompt }: { id: string; prompt: string }): Promise<void> {
  const paths = runPaths(config.DATA_DIR, id);
  const pipeline = new Pipeline(id, prompt, paths);
  try {
    await initRunDir(paths, prompt);
    await pipeline.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[pipeline] run crashed", { id, message });
    await pipeline.finish("failed", `Factory error: ${message}`);
  }
}

class Pipeline {
  private budget: Budget;
  private readonly handoffs: Partial<Record<AgentStageKey, unknown>> = {};
  private seq = 0;
  private stopReason: string | null = null;
  private readonly appUrl: string;
  /** Labels of stages in flight; more than one while parallel branches run. */
  private readonly running = new Set<string>();
  /** The developer's latest session, resumed by fix rounds so they start with full context. */
  private devSessionId: string | null = null;
  /** Workspace commit the live container was built from. */
  private deployedCommit: string | null = null;

  constructor(
    private readonly id: string,
    private readonly prompt: string,
    private readonly paths: RunPaths,
  ) {
    this.budget = createBudget({ capUsd: config.RUN_BUDGET_USD, deployReserveUsd: DEPLOY_RESERVE_USD });
    const port = config.PUBLIC_HTTP_PORT === 80 ? "" : `:${config.PUBLIC_HTTP_PORT}`;
    this.appUrl = `http://${id}.apps.${config.BASE_DOMAIN}${port}`;
  }

  async run(): Promise<void> {
    await this.writeRunJson("running");

    // Research is helpful but not essential: if it fails, requirements are
    // written from the prompt alone. A budget stop still ends the run at the
    // next step.
    await this.step("research");

    const requirements = await this.step("requirements");
    if (requirements.outcome !== "succeeded") return this.stop(requirements, "Requirements failed");

    // Both depend only on the requirements, so they run side by side.
    const [testCases, design] = await Promise.all([this.step("testCases"), this.step("design")]);
    if (testCases.outcome !== "succeeded") return this.stop(testCases, "Test cases failed");
    if (design.outcome !== "succeeded") return this.stop(design, "Design failed");

    const dev = await this.step("development");
    this.devSessionId = dev.sessionId;
    if (!(await workspaceHasFile(this.paths, "Dockerfile"))) {
      return this.stop(dev, "Development produced no deployable app (no Dockerfile)");
    }

    const { clean, lastGate } = await this.verifyAndFix();
    const healthy = await this.ensureDeployed(lastGate);
    if (!healthy) {
      return this.finish(
        this.stopReason ? "failed_budget" : "failed",
        this.stopReason ?? "The app never passed its /health check",
      );
    }

    RunsStore.updateRun(this.id, { appUrl: this.appUrl });
    return this.finish(clean ? "deployed" : "deployed_partial", clean ? null : this.stopReason ?? "Shipped with unresolved issues");
  }

  /**
   * Verify (free, deterministic) and review (LLM, read-only) run in parallel.
   * Whatever fails gets the cheapest agent that can fix it: deployment repair
   * for a broken container, test triage for failing tests, and a resumed
   * developer session only for real app bugs or blocking review findings.
   */
  private async verifyAndFix(): Promise<{ clean: boolean; lastGate: GateResult | null }> {
    let previousReview: ReviewHandoff | null = null;
    let reviewedCommit: string | null = null;
    let lastGate: GateResult | null = null;

    for (let round = 0; ; round++) {
      const suffix = round === 0 ? undefined : `round-${round + 1}`;
      const commitBeforeReview = await headCommit(this.paths);
      const rereview =
        previousReview && reviewedCommit ? { diffRange: `${reviewedCommit}..HEAD`, previousFindings: previousReview } : null;

      const [gate, review] = await Promise.all([this.verify("full", suffix), this.step("review", { rereview, suffix })]);
      lastGate = gate;
      if (review.outcome === "succeeded") {
        previousReview = review.handoff as ReviewHandoff;
        reviewedCommit = commitBeforeReview;
      }
      const reviewBlocking = review.outcome === "succeeded" && (review.handoff as ReviewHandoff).blocking;

      if (gate.passed && review.outcome === "succeeded" && !reviewBlocking) return { clean: true, lastGate };
      if (isBudgetStop(review.outcome)) return { clean: false, lastGate };
      if (round >= MAX_FIX_ATTEMPTS) {
        this.stopReason ??= `Unresolved verify/review issues after ${MAX_FIX_ATTEMPTS} fix rounds`;
        return { clean: false, lastGate };
      }

      if (!gate.containerOk) {
        const repair = await this.step("deployment", { gate, suffix: `repair-${round + 1}` });
        if (isBudgetStop(repair.outcome)) return { clean: false, lastGate };
      }

      let triage: TriageHandoff | null = null;
      let triageFailed = false;
      if (gate.failedSteps.includes("tests")) {
        const result = await this.step("testing", { gate, suffix: `triage-${round + 1}` });
        if (isBudgetStop(result.outcome)) return { clean: false, lastGate };
        triage = result.outcome === "succeeded" ? (result.handoff as TriageHandoff) : null;
        triageFailed = result.outcome !== "succeeded";
      }

      const needsDevFix =
        reviewBlocking || gate.failedSteps.includes("smoke") || triageFailed || (triage?.appBugs.length ?? 0) > 0;
      if (!needsDevFix) continue;

      const fix = await this.step("development", {
        budgetUsd: FIX_BUDGET_USD,
        fix: {
          attempt: round + 1,
          gate,
          resumed: false,
          review: reviewBlocking ? review.handoff : null,
          triage: triageFailed ? { note: "Test triage did not complete; read the verify log." } : triage,
        },
        resumeSessionId: this.devSessionId,
        skills: FIX_SKILLS,
        suffix: `fix-${round + 1}`,
      });
      if (fix.sessionId) this.devSessionId = fix.sessionId;
      if (isBudgetStop(fix.outcome)) return { clean: false, lastGate };
    }
  }

  /**
   * A green verify already deployed the app. This makes sure the live
   * container matches the final code (a budget stop can land after a fix
   * that was never re-verified) and gives a broken container one repair,
   * funded by the reserve.
   */
  private async ensureDeployed(lastGate: GateResult | null): Promise<boolean> {
    let gate = lastGate;
    const head = await headCommit(this.paths);
    if (!gate?.containerOk || head !== this.deployedCommit) gate = await this.verify("container", "final");
    if (!gate.containerOk) {
      const repair = await this.step("deployment", { gate, suffix: "final" });
      if (repair.outcome === "succeeded") await this.verify("container", "after-repair");
    }
    return this.verifyHealth();
  }

  private async verify(mode: GateMode, suffix?: string): Promise<GateResult> {
    // Sequence number is taken synchronously so a parallel stage can't reuse it.
    this.seq += 1;
    const seq = this.seq;
    const sp = stagePaths(this.paths, seq, "verify", suffix);
    const label = suffix ? `${VERIFY_LABEL} (${suffix})` : VERIFY_LABEL;
    RunsStore.startStage(this.id, { dirName: sp.dirName, label, seq, stageKey: "verify" });
    this.markRunning(label, true);
    const startedAt = Date.now();
    const commit = await headCommit(this.paths);

    const dev = this.handoffs.development as { commands?: Commands } | undefined;
    const design = this.handoffs.design as { commands?: Commands } | undefined;
    const testPlan = this.handoffs.testCases as { smokeChecks?: SmokeCheck[] } | undefined;
    const gate = await runGate({
      appPort: APP_PORT,
      // The developer reports the commands it actually verified; the design's are a fallback.
      commands: dev?.commands ?? design?.commands ?? null,
      mode,
      paths: this.paths,
      runId: this.id,
      smokeChecks: testPlan?.smokeChecks ?? [],
      stagePaths: sp,
    });
    if (gate.containerOk) this.deployedCommit = commit;

    await appendLedger(this.paths, {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      inputTokens: 0,
      outcome: gate.passed ? "passed" : `failed: ${gate.failedSteps.join(", ")}`,
      outputTokens: 0,
      stageDir: sp.dirName,
      stageKey: "verify",
      timestamp: new Date().toISOString(),
    });
    RunsStore.finishStage(this.id, seq, {
      costUsd: 0,
      error: gate.passed ? null : `Failed: ${gate.failedSteps.join(", ")}`,
      status: gate.passed ? "succeeded" : "failed",
    });
    this.markRunning(label, false);
    await this.writeRunJson("running");
    return gate;
  }

  private async step(stageKey: AgentStageKey, options: StepOptions = {}): Promise<StepResult> {
    const settings = STAGE_SETTINGS[stageKey];
    const label = options.fix
      ? `Fix ${options.fix.attempt}`
      : options.suffix
        ? `${settings.label} (${options.suffix})`
        : settings.label;

    // Everything up to the first await runs synchronously, so two steps
    // started with Promise.all can't both claim the same money or sequence number.
    const decision = decideAllowance({
      budget: this.budget,
      canUseReserve: stageKey === "deployment",
      minUsd: settings.minUsd,
      requestedUsd: options.budgetUsd ?? settings.budgetUsd,
    });
    if (decision.kind === "stop") {
      console.info("[pipeline] early stop", { reason: decision.reason, runId: this.id, stageKey });
      this.stopReason ??= `Stopped before ${label}: ${decision.reason}`;
      return { handoff: null, outcome: "not_started", sessionId: null };
    }
    this.budget = commitAllowance(this.budget, decision.allowanceUsd);
    this.seq += 1;
    const seq = this.seq;
    const sp = stagePaths(this.paths, seq, stageKey, options.suffix);
    RunsStore.startStage(this.id, { dirName: sp.dirName, label, seq, stageKey });
    this.markRunning(label, true);
    await this.writeRunJson("running");

    const ctx: StageContext = {
      allowanceUsd: decision.allowanceUsd,
      appPort: APP_PORT,
      appUrl: this.appUrl,
      fix: options.fix ?? null,
      gate: options.gate ?? null,
      handoffs: this.handoffs,
      rereview: options.rereview ?? null,
      runId: this.id,
      stageDir: sp.dir,
      userPrompt: this.prompt,
      workspaceDir: this.paths.workspace,
    };
    const agent = AGENTS[stageKey];
    const resuming = Boolean(options.resumeSessionId);
    const promptFor = (resumed: boolean) =>
      agent.buildPrompt(ctx.fix ? { ...ctx, fix: { ...ctx.fix, resumed } } : ctx);

    const result = await runStage({
      allowanceUsd: decision.allowanceUsd,
      allowedTools: agent.allowedTools,
      cwd: agent.cwd(ctx),
      freshPrompt: promptFor(false),
      mcpServers: agent.mcpServers?.(ctx),
      model: config.FACTORY_MODEL ?? settings.model,
      prompt: promptFor(resuming),
      resumeSessionId: options.resumeSessionId ?? null,
      runtime: agent.runtime,
      schema: agent.schema,
      settings,
      skills: options.skills ?? settings.skills,
      stageKey,
      stagePaths: sp,
      systemPrompt: systemPromptFor(agent.role, ctx),
    });

    this.budget = recordSpend(this.budget, result.ledger, { releaseUsd: decision.allowanceUsd });
    await appendLedger(this.paths, result.ledger);
    RunsStore.finishStage(this.id, seq, {
      costUsd: result.ledger.costUsd,
      error: result.error,
      status: result.outcome,
    });
    RunsStore.updateRun(this.id, { costUsd: this.budget.spentUsd });
    if (WORKSPACE_STAGES.has(stageKey)) await commitWorkspace(this.paths, `${sp.dirName}: ${label}`);

    if (result.outcome === "succeeded") this.handoffs[stageKey] = result.handoff;
    if (result.outcome === "stopped_budget") this.stopReason ??= `${label}: ${result.error}`;
    this.markRunning(label, false);
    console.info("[pipeline] stage done", {
      costUsd: result.ledger.costUsd.toFixed(4),
      outcome: result.outcome,
      runId: this.id,
      spentUsd: this.budget.spentUsd.toFixed(4),
      stage: sp.dirName,
    });
    return { handoff: result.handoff, outcome: result.outcome, sessionId: result.sessionId };
  }

  /** Independent of what any agent claims: ask the deployer directly. */
  private async verifyHealth(): Promise<boolean> {
    const result = await callDeployer("/check", { path: "/health", runId: this.id });
    if (!result.ok) return false;
    try {
      return (JSON.parse(result.body) as { status?: number }).status === 200;
    } catch {
      return false;
    }
  }

  private markRunning(label: string, on: boolean): void {
    if (on) this.running.add(label);
    else this.running.delete(label);
    RunsStore.updateRun(this.id, { currentStage: this.running.size ? [...this.running].join(" + ") : null });
  }

  private stop(step: StepResult, fallbackReason: string): Promise<void> {
    const status: RunStatus = isBudgetStop(step.outcome) ? "failed_budget" : "failed";
    return this.finish(status, this.stopReason ?? fallbackReason);
  }

  async finish(status: RunStatus, stopReason: string | null): Promise<void> {
    RunsStore.updateRun(this.id, { currentStage: null, status, stopReason });
    await this.writeRunJson(status, stopReason);
    await writeFile(this.paths.summary, this.renderSummary(status, stopReason));
    console.info("[pipeline] run finished", { runId: this.id, spentUsd: this.budget.spentUsd, status });
  }

  private async writeRunJson(status: RunStatus, stopReason: string | null = this.stopReason): Promise<void> {
    const run = RunsStore.getRun(this.id);
    await writeJson(this.paths.runJson, {
      appUrl: run?.appUrl ?? null,
      budgetUsd: this.budget.capUsd,
      currentStage: run?.currentStage ?? null,
      id: this.id,
      spentUsd: this.budget.spentUsd,
      stages: RunsStore.listStages(this.id),
      status,
      stopReason,
    });
  }

  private renderSummary(status: RunStatus, stopReason: string | null): string {
    const stages = RunsStore.listStages(this.id);
    const rows = stages
      .map((s) => `| ${s.seq} | ${s.label} | ${s.status} | $${s.costUsd.toFixed(2)} | [REPORT](stages/${s.dirName}/REPORT.md) |`)
      .join("\n");
    const app = RunsStore.getRun(this.id)?.appUrl;
    return `# Run ${this.id}

**Status:** ${status}${stopReason ? `  \n**Stop reason:** ${stopReason}` : ""}${app ? `  \n**App:** ${app}` : ""}  \n**Spend:** $${this.budget.spentUsd.toFixed(2)} of $${this.budget.capUsd.toFixed(2)}

## Prompt

${this.prompt}

## Stages

| # | Stage | Status | Cost | Report |
|---|---|---|---|---|
${rows}

"Verify" stages are the factory's own automated checks (tests, image build, container health, smoke checks) and cost nothing. Agent stage folders also hold \`handoff.json\` (what later agents received), \`input-prompt.md\` (what the agent was asked), \`transcript.jsonl\` (full agent trace) and \`meta.json\` (model, skills, tokens, cost, resumed session). Per-stage code changes: \`git -C workspace log -p\`.
`;
  }
}

function isBudgetStop(outcome: StepOutcome): boolean {
  return outcome === "stopped_budget" || outcome === "not_started";
}
