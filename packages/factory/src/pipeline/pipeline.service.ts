import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { agentFor } from "../agents/agents.registry";
import { asPrd } from "../agents/requirements/requirements.utils";
import { validatePrd } from "../agents/requirements/requirements.validate";
import { systemPromptFor, type StageContext } from "../agents/agents.shared";
import * as BoardService from "../board/board.service";
import { config } from "../lib/config";
import { callDeployer } from "../lib/deployer";
import * as LibrarianService from "../librarian/librarian.service";
import type { PendingLesson } from "../librarian/librarian.service";
import * as LibrarianStore from "../librarian/librarian.store";
import { librarianMcpServer, librarianToolNames, librarianToolsets } from "../librarian/librarian.tools";
import type { LessonInput } from "../librarian/librarian.types";
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
  PRD_REPAIR_BUDGET_USD,
  skillsFor,
  STAGE_SETTINGS,
  VERIFY_LABEL,
} from "./pipeline.constants";
import { runGate, type GateMode, type GateResult, type SmokeCheck } from "./pipeline.gate";
import { activityObserver, clearActivity, recordActivity } from "./pipeline.activity";
import { runStage, type StageOutcome } from "./pipeline.stage-runner";
import { shouldCheckMobile, uiScreensFrom } from "./pipeline.ui-check";
import type { AgentStageKey, DesignSystem, RunStatus } from "./pipeline.types";

type StepOutcome = StageOutcome | "not_started";
type StepResult = { handoff: unknown; outcome: StepOutcome; sessionId: string | null };

type StepOptions = {
  budgetUsd?: number;
  fix?: StageContext["fix"];
  gate?: GateResult | null;
  repairIssues?: string[];
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

/** Repair agents report lessons; the same three stages, since only they change the app to make a check pass. */
const LESSON_STAGES = WORKSPACE_STAGES;

/**
 * Runs the whole factory for one prompt. Never throws: every outcome ends in
 * a terminal run status plus SUMMARY.md, so a failed run is still inspectable.
 */
export async function executeRun({
  designSystem,
  id,
  prompt,
}: {
  designSystem: DesignSystem;
  id: string;
  prompt: string;
}): Promise<void> {
  const paths = runPaths(config.DATA_DIR, id);
  const pipeline = new Pipeline(id, prompt, paths, designSystem);
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
  /** Lessons repair agents reported, kept until a later verify or review proves (or disproves) the fix. */
  private pendingLessons: PendingLesson[] = [];

  constructor(
    private readonly id: string,
    private readonly prompt: string,
    private readonly paths: RunPaths,
    private readonly designSystem: DesignSystem,
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
    await this.repairPrd(requirements.sessionId);

    // All three depend only on the PRD, so they run side by side. The UI/UX
    // design is valuable but not essential: without it the developer still
    // has the PRD's screens and the frontend-design skill.
    const [testCases, architecture] = await Promise.all([
      this.step("testCases"),
      this.step("architecture"),
      this.step("uiDesign"),
    ]);
    if (testCases.outcome !== "succeeded") return this.stop(testCases, "Test cases failed");
    if (architecture.outcome !== "succeeded") return this.stop(architecture, "Architecture failed");

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
   * The PRD's cross-references are checked by code. If any are broken, the
   * requirements session is resumed once to correct them: cheap, because the
   * agent already has its PRD in context, and far cheaper than design and
   * development working from an inconsistent spec. Remaining problems are
   * listed in the PRD report and don't stop the run.
   */
  private async repairPrd(sessionId: string | null): Promise<void> {
    const prd = asPrd(this.handoffs.requirements);
    const issues = prd ? validatePrd(prd) : [];
    if (issues.length === 0) return;
    console.info("[pipeline] PRD inconsistent; repairing", { issues: issues.length, runId: this.id });
    await this.step("requirements", {
      budgetUsd: PRD_REPAIR_BUDGET_USD,
      repairIssues: issues,
      resumeSessionId: sessionId,
      suffix: "repair",
    });
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
      this.settleLessons(gate, review.outcome === "succeeded" ? !reviewBlocking : null);

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
        reviewBlocking ||
        gate.failedSteps.includes("smoke") ||
        gate.failedSteps.includes("ui") ||
        triageFailed ||
        (triage?.appBugs.length ?? 0) > 0;
      if (!needsDevFix) continue;

      const fix = await this.step("development", {
        budgetUsd: FIX_BUDGET_USD,
        fix: {
          attempt: round + 1,
          gate,
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
      if (repair.outcome === "succeeded") this.settleLessons(await this.verify("container", "after-repair"), null);
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
    const architecture = this.handoffs.architecture as { commands?: Commands } | undefined;
    const testPlan = this.handoffs.testCases as { smokeChecks?: SmokeCheck[] } | undefined;
    const gate = await runGate({
      onStep: (text) => recordActivity(this.id, label, text),
      appPort: APP_PORT,
      // The developer reports the commands it actually verified; the architecture's are a fallback.
      commands: dev?.commands ?? architecture?.commands ?? null,
      mode,
      paths: this.paths,
      runId: this.id,
      smokeChecks: testPlan?.smokeChecks ?? [],
      stagePaths: sp,
      uiCheckMobile: this.checkMobile(),
      uiScreens: uiScreensFrom(this.handoffs.development),
    });
    if (gate.containerOk) this.deployedCommit = commit;
    await BoardService.safely("verify", async () => {
      const testLog = mode === "full" ? await readFile(join(sp.dir, "tests.log"), "utf8").catch(() => "") : "";
      const testsWritten = (this.handoffs.development as { testsWritten?: string[] } | undefined)?.testsWritten ?? [];
      BoardService.onVerify(this.id, { gate, testLog, testsWritten }, { actor: label });
    });

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

    const toolsets = librarianToolsets(stageKey);
    const ctx: StageContext = {
      allowanceUsd: decision.allowanceUsd,
      appPort: APP_PORT,
      appUrl: this.appUrl,
      checkMobile: this.checkMobile(),
      designSystem: this.designSystem,
      fix: options.fix ?? null,
      gate: options.gate ?? null,
      handoffs: this.handoffs,
      lessons: stageKey === "development" && !options.fix ? this.promptLessons() : [],
      librarianToolsets: toolsets,
      repairIssues: options.repairIssues ?? null,
      rereview: options.rereview ?? null,
      resumed: false,
      runId: this.id,
      stageDir: sp.dir,
      userPrompt: this.prompt,
      workspaceDir: this.paths.workspace,
    };
    const agent = agentFor(stageKey, this.designSystem);
    const resuming = Boolean(options.resumeSessionId);
    const promptFor = (resumed: boolean) => agent.buildPrompt({ ...ctx, resumed });

    const librarian = librarianMcpServer({
      handoffs: this.handoffs,
      runId: this.id,
      stage: label,
      stageKey,
      workspaceDir: this.paths.workspace,
    });

    const result = await runStage({
      allowanceUsd: decision.allowanceUsd,
      allowedTools: [...agent.allowedTools, ...librarianToolNames(stageKey)],
      cwd: agent.cwd(ctx),
      freshPrompt: promptFor(false),
      mcpServers: librarian ? { ...agent.mcpServers?.(ctx), librarian } : agent.mcpServers?.(ctx),
      model: config.FACTORY_MODEL ?? settings.model,
      onMessage: this.observer(stageKey, label, agent.cwd(ctx)),
      prompt: promptFor(resuming),
      renderReport: agent.renderReport,
      resumeSessionId: options.resumeSessionId ?? null,
      runtime: agent.runtime,
      schema: agent.schema,
      settings,
      skills: skillsFor(stageKey, this.designSystem, options.skills ?? settings.skills),
      stageKey,
      stagePaths: sp,
      systemPrompt: systemPromptFor(agent.role, ctx, agent.runtime),
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

    if (result.outcome === "succeeded") {
      this.handoffs[stageKey] = result.handoff;
      await this.updateBoard(stageKey, label, result.handoff);
      if (LESSON_STAGES.has(stageKey)) this.collectLessons(label, result.handoff);
    }
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

  private collectLessons(label: string, handoff: unknown): void {
    const lessons = (handoff as { lessons?: LessonInput[] } | null)?.lessons;
    if (!Array.isArray(lessons)) return;
    this.pendingLessons.push(...lessons.map((lesson) => ({ ...lesson, reportedBy: label })));
  }

  /**
   * Stores the lessons this verify (and review, when one ran alongside)
   * proves. Lessons are knowledge for future runs, so a failure here is
   * logged and never affects this run.
   */
  private settleLessons(gate: GateResult, reviewOk: boolean | null): void {
    if (this.pendingLessons.length === 0) return;
    try {
      const { keep, proven } = LibrarianService.settleLessons(this.pendingLessons, { gate, reviewOk });
      this.pendingLessons = keep;
      if (proven.length === 0) return;
      const recorded = LibrarianService.recordLessons({ designSystem: this.designSystem, lessons: proven, prompt: this.prompt, runId: this.id });
      console.info("[pipeline] lessons recorded", { proven: proven.length, recorded, runId: this.id });
    } catch (error) {
      console.error("[pipeline] recording lessons failed", { message: error instanceof Error ? error.message : String(error), runId: this.id });
    }
  }

  private promptLessons() {
    if (config.LIBRARIAN === "off") return [];
    try {
      return LibrarianService.topLessons(this.designSystem);
    } catch (error) {
      console.error("[pipeline] reading lessons failed", { message: error instanceof Error ? error.message : String(error), runId: this.id });
      return [];
    }
  }

  /** Moves board cards from a finished stage's handoff. */
  private async updateBoard(stageKey: AgentStageKey, label: string, handoff: unknown): Promise<void> {
    await BoardService.safely(stageKey, () => {
      const stamp = { actor: label };
      if (stageKey === "requirements") BoardService.onRequirements(this.id, handoff, stamp);
      if (stageKey === "testCases") BoardService.onTestPlan(this.id, handoff, this.handoffs.requirements, stamp);
      if (stageKey === "development") BoardService.onDevelopmentDone(this.id, handoff, stamp);
    });
  }

  /**
   * Live progress for people watching: an activity line per agent action and,
   * for the developer, task board moves. Read from the stream the factory
   * already receives, so it costs no tokens; a bug here never stops a stage.
   */
  private observer(stageKey: AgentStageKey, label: string, cwd: string): (message: SDKMessage) => void {
    const observers = [activityObserver({ cwd, runId: this.id, stage: label })];
    if (stageKey === "development") observers.push(BoardService.developerObserver(this.id, { actor: label }));
    return (message) => {
      for (const observe of observers) {
        try {
          observe(message);
        } catch (error) {
          console.error("[pipeline] progress observer failed", { message: error instanceof Error ? error.message : String(error) });
        }
      }
    };
  }

  private checkMobile(): boolean {
    return shouldCheckMobile({
      designSystem: this.designSystem,
      prd: this.handoffs.requirements,
      uiDesign: this.handoffs.uiDesign,
    });
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
    clearActivity(this.id);
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
    const librarian = LibrarianStore.queryStats(this.id)
      .map((s) => `| ${s.stage} | ${s.calls} | ${s.withHits} |`)
      .join("\n");
    return `# Run ${this.id}

**Status:** ${status}${stopReason ? `  \n**Stop reason:** ${stopReason}` : ""}${app ? `  \n**App:** ${app}` : ""}  \n**Spend:** $${this.budget.spentUsd.toFixed(2)} of $${this.budget.capUsd.toFixed(2)}

## Prompt

${this.prompt}

## Stages

| # | Stage | Status | Cost | Report |
|---|---|---|---|---|
${rows}
${librarian ? `\n## Librarian\n\n| Stage | Queries | With hits |\n|---|---|---|\n${librarian}\n` : ""}
"Verify" stages are the factory's own automated checks (tests, image build, container health, smoke checks) and cost nothing. Agent stage folders also hold \`handoff.json\` (what later agents received), \`input-prompt.md\` (what the agent was asked), \`transcript.jsonl\` (full agent trace) and \`meta.json\` (model, skills, tokens, cost, resumed session). Per-stage code changes: \`git -C workspace log -p\`.
`;
  }
}

function isBudgetStop(outcome: StepOutcome): boolean {
  return outcome === "stopped_budget" || outcome === "not_started";
}
