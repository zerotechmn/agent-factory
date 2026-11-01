import { writeFile } from "node:fs/promises";

import { AGENTS } from "../agents/agents.registry";
import { systemPromptFor, type StageContext } from "../agents/agents.shared";
import { config } from "../lib/config";
import { callDeployer } from "../lib/deployer";
import * as RunsStore from "../runs/runs.store";
import {
  appendLedger,
  commitWorkspace,
  initRunDir,
  runPaths,
  stagePaths,
  workspaceHasFile,
  writeJson,
  type RunPaths,
} from "./pipeline.artifacts";
import { createBudget, decideAllowance, recordSpend, type Budget } from "./pipeline.budget";
import {
  APP_PORT,
  DEPLOY_RESERVE_USD,
  FIX_BUDGET_USD,
  MAX_FIX_ATTEMPTS,
  STAGE_SETTINGS,
} from "./pipeline.constants";
import { runStage, type StageOutcome } from "./pipeline.stage-runner";
import type { RunStatus, StageKey } from "./pipeline.types";

type StepResult = { handoff: unknown; outcome: StageOutcome | "not_started" };

type ReviewHandoff = { blocking: boolean; findings: unknown[] };
type TestingHandoff = { failures: unknown[]; passed: boolean };

/** Stages that edit the workspace get a git commit afterwards so diffs per agent are inspectable. */
const WORKSPACE_STAGES = new Set<StageKey>(["development", "testing", "deployment"]);

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
  private readonly handoffs: Partial<Record<StageKey, unknown>> = {};
  private seq = 0;
  private stopReason: string | null = null;
  private readonly appUrl: string;

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

    // 0: research. Helpful but not essential, so a failure (search outage, bad
    // output) only means requirements are written without it. A budget stop
    // here still ends the run below, at requirements.
    await this.step("research");

    // 1-3: specification. Without these there is nothing coherent to build.
    for (const key of ["requirements", "testCases", "design"] as const) {
      const step = await this.step(key);
      if (step.outcome !== "succeeded") return this.finish(this.failStatus(step), this.stopReason ?? `${STAGE_SETTINGS[key].label} failed`);
    }

    // 4: build.
    const dev = await this.step("development");
    if (!(await workspaceHasFile(this.paths, "Dockerfile"))) {
      return this.finish(this.failStatus(dev), this.stopReason ?? "Development produced no deployable app (no Dockerfile)");
    }

    // 5-6: review + test, with a bounded fix loop. Any budget stop here skips
    // straight to deployment: shipping something beats shipping nothing.
    let clean = false;
    for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const suffix = attempt === 0 ? undefined : `round-${attempt + 1}`;
      const review = await this.step("review", { suffix });
      if (review.outcome === "stopped_budget" || review.outcome === "not_started") break;
      const testing = await this.step("testing", { suffix });
      if (testing.outcome === "stopped_budget" || testing.outcome === "not_started") break;

      const reviewOk = review.outcome === "succeeded" && !(review.handoff as ReviewHandoff).blocking;
      const testsOk = testing.outcome === "succeeded" && (testing.handoff as TestingHandoff).passed;
      if (reviewOk && testsOk) {
        clean = true;
        break;
      }
      if (attempt === MAX_FIX_ATTEMPTS) {
        this.stopReason ??= `Unresolved review/test issues after ${MAX_FIX_ATTEMPTS} fix attempts`;
        break;
      }

      const fix = await this.step("development", {
        budgetUsd: FIX_BUDGET_USD,
        fix: { attempt: attempt + 1, review: review.handoff, testing: testing.handoff },
        suffix: `fix-${attempt + 1}`,
      });
      if (fix.outcome === "stopped_budget" || fix.outcome === "not_started") break;
    }

    // 7: deploy, funded by the reserve that earlier stages could not touch.
    const deploy = await this.step("deployment");
    const healthy = await this.verifyHealth();
    if (!healthy) {
      return this.finish(this.failStatus(deploy), this.stopReason ?? "Deployment did not pass the /health check");
    }

    RunsStore.updateRun(this.id, { appUrl: this.appUrl });
    return this.finish(clean ? "deployed" : "deployed_partial", clean ? null : this.stopReason ?? "Shipped with unresolved issues");
  }

  private async step(
    stageKey: StageKey,
    options: { budgetUsd?: number; fix?: StageContext["fix"]; suffix?: string } = {},
  ): Promise<StepResult> {
    const settings = STAGE_SETTINGS[stageKey];
    const decision = decideAllowance({
      budget: this.budget,
      isDeployment: stageKey === "deployment",
      minUsd: settings.minUsd,
      requestedUsd: options.budgetUsd ?? settings.budgetUsd,
    });
    if (decision.kind === "stop") {
      console.info("[pipeline] early stop", { reason: decision.reason, runId: this.id, stageKey });
      this.stopReason ??= `Stopped before ${settings.label}: ${decision.reason}`;
      return { handoff: null, outcome: "not_started" };
    }

    this.seq += 1;
    const sp = stagePaths(this.paths, this.seq, stageKey, options.suffix);
    const label = options.fix ? `Fix ${options.fix.attempt}` : options.suffix ? `${settings.label} (${options.suffix})` : settings.label;
    RunsStore.startStage(this.id, { dirName: sp.dirName, label, seq: this.seq, stageKey });
    RunsStore.updateRun(this.id, { currentStage: label });
    await this.writeRunJson("running");

    const ctx: StageContext = {
      allowanceUsd: decision.allowanceUsd,
      appPort: APP_PORT,
      appUrl: this.appUrl,
      fix: options.fix ?? null,
      handoffs: this.handoffs,
      runId: this.id,
      stageDir: sp.dir,
      userPrompt: this.prompt,
      workspaceDir: this.paths.workspace,
    };
    const agent = AGENTS[stageKey];

    const result = await runStage({
      allowanceUsd: decision.allowanceUsd,
      allowedTools: agent.allowedTools,
      cwd: agent.cwd(ctx),
      mcpServers: agent.mcpServers?.(ctx),
      model: config.FACTORY_MODEL,
      prompt: agent.buildPrompt(ctx),
      schema: agent.schema,
      settings,
      stageKey,
      stagePaths: sp,
      systemPrompt: systemPromptFor(agent.role, ctx),
    });

    this.budget = recordSpend(this.budget, result.ledger);
    await appendLedger(this.paths, result.ledger);
    RunsStore.finishStage(this.id, this.seq, {
      costUsd: result.ledger.costUsd,
      error: result.error,
      status: result.outcome,
    });
    RunsStore.updateRun(this.id, { costUsd: this.budget.spentUsd });
    if (WORKSPACE_STAGES.has(stageKey)) await commitWorkspace(this.paths, `${sp.dirName}: ${label}`);

    if (result.outcome === "succeeded") this.handoffs[stageKey] = result.handoff;
    if (result.outcome === "stopped_budget") this.stopReason ??= `${label}: ${result.error}`;
    console.info("[pipeline] stage done", {
      costUsd: result.ledger.costUsd.toFixed(4),
      outcome: result.outcome,
      runId: this.id,
      spentUsd: this.budget.spentUsd.toFixed(4),
      stage: sp.dirName,
    });
    return { handoff: result.handoff, outcome: result.outcome };
  }

  /** Independent of what the deployment agent claims: ask the deployer directly. */
  private async verifyHealth(): Promise<boolean> {
    const result = await callDeployer("/check", { path: "/health", runId: this.id });
    if (!result.ok) return false;
    try {
      return (JSON.parse(result.body) as { status?: number }).status === 200;
    } catch {
      return false;
    }
  }

  private failStatus(step: StepResult): RunStatus {
    return step.outcome === "stopped_budget" || step.outcome === "not_started" ? "failed_budget" : "failed";
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

Each stage folder also holds \`handoff.json\` (what the next agent received), \`input-prompt.md\` (what this agent was asked), \`transcript.jsonl\` (full agent trace) and \`meta.json\`. Per-stage code changes: \`git -C workspace log -p\`.
`;
  }
}
