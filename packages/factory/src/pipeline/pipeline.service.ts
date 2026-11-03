import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Acceptance } from "../agents/acceptance/acceptance.schema";
import { agentFor } from "../agents/agents.registry";
import { mergeDevHandoffs, planSlices, sliceBudgets, type DevHandoff } from "../agents/development/development.slices";
import type { Prd } from "../agents/requirements/requirements.schema";
import { asPrd, describePrdDiff, prdDiff } from "../agents/requirements/requirements.utils";
import { coverageIssues, type PrdReview } from "../agents/prd-review/prd-review.schema";
import { checkPrdQuality, validatePrd } from "../agents/requirements/requirements.validate";
import { jsonBlock, systemPromptFor, type DevPartContext, type DevPartSummary, type StageContext } from "../agents/agents.shared";
import * as BoardService from "../board/board.service";
import { config } from "../lib/config";
import { callDeployer } from "../lib/deployer";
import * as LibrarianService from "../librarian/librarian.service";
import type { PendingLesson } from "../librarian/librarian.service";
import * as LibrarianStore from "../librarian/librarian.store";
import { librarianHooks } from "../librarian/librarian.hooks";
import { librarianMcpServer, librarianToolNames, librarianToolsets } from "../librarian/librarian.tools";
import type { LessonInput } from "../librarian/librarian.types";
import { askCustomer } from "../questions/questions.service";
import { isWatched } from "../runs/runs.presence";
import * as QuestionsStore from "../questions/questions.store";
import type { Checkpoint, CheckpointResult, PrdCheckpointContext, Question } from "../questions/questions.types";
import { prdContext, prdQuestions, renderPrdFeedback, renderResearchAnswers, researchQuestions } from "../questions/questions.utils";
import * as RevisionsStore from "../revisions/revisions.store";
import * as RunsStore from "../runs/runs.store";
import {
  appendLedger,
  commitWorkspace,
  headCommit,
  initRunDir,
  resetWorkspace,
  runPaths,
  stagePaths,
  workspaceHasFile,
  writeJson,
  type RunPaths,
} from "./pipeline.artifacts";
import { commitAllowance, createBudget, decideAllowance, recordSpend, type Budget, type ReserveAccess } from "./pipeline.budget";
import {
  ACCEPTANCE_REPAIR_BUDGET_USD,
  APP_PORT,
  REVISION_DEV_BUDGET_USD,
  DEPLOY_RESERVE_USD,
  FIX_BUDGET_USD,
  FIX_RESERVE_USD,
  FIX_SKILLS,
  MAX_FIX_ATTEMPTS,
  PRD_REPAIR_BUDGET_USD,
  skillsFor,
  STAGE_SETTINGS,
  VERIFY_LABEL,
} from "./pipeline.constants";
import { runGate, type GateMode, type GateResult, type SmokeCheck } from "./pipeline.gate";
import { ACCEPTANCE_DIR, checkAcceptanceFiles, installAcceptance, protectAcceptance } from "./pipeline.acceptance";
import { activityObserver, clearActivity, recordActivity } from "./pipeline.activity";
import { registerRun, RunCancelledError, throwIfCancelled, unregisterRun } from "./pipeline.cancel";
import { Journal, loadJournal, type JournalEntry } from "./pipeline.journal";
import { runStage, type StageOutcome } from "./pipeline.stage-runner";
import { shouldCheckMobile, uiScreensFrom } from "./pipeline.ui-check";
import type { AgentStageKey, DesignSystem, RunStatus } from "./pipeline.types";

type StepOutcome = StageOutcome | "not_started";
type StepResult = { handoff: unknown; outcome: StepOutcome; sessionId: string | null };

type StepOptions = {
  budgetUsd?: number;
  customerInput?: string | null;
  /** Which part of a development built in parts this step is. */
  devPart?: DevPartContext;
  /** Overrides the stage's minimum allowance, for parts smaller than a whole stage. */
  minUsd?: number;
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
  interactive = true,
  prompt,
  revision = null,
}: {
  designSystem: DesignSystem;
  id: string;
  /** False: never pause for the customer (benchmark and scripted runs). */
  interactive?: boolean;
  prompt: string;
  /** Set for a feedback round on a deployed app: rebuilt from the run's stored data. */
  revision?: { feedback: string; n: number } | null;
}): Promise<void> {
  const paths = runPaths(config.DATA_DIR, id);
  const pipeline = new Pipeline(id, prompt, paths, designSystem, interactive);
  pipeline.cancelSignal = registerRun(id);
  try {
    if (revision) return await pipeline.revise(revision);
    // A run that already has steps was interrupted by a restart and re-queued: carry on from where it stopped.
    if (RunsStore.listStages(id).length > 0) return await pipeline.resume();
    await initRunDir(paths, prompt);
    await pipeline.run();
  } catch (error) {
    if (error instanceof RunCancelledError) {
      console.info("[pipeline] run cancelled", { id, revision: revision?.n ?? null });
      return revision ? await pipeline.cancelRevision() : await pipeline.finish("cancelled", "Cancelled by the user");
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[pipeline] run crashed", { id, message, revision: revision?.n ?? null });
    if (revision) return pipeline.finishRevision({ deployed: false, note: `Factory error: ${message}` });
    await pipeline.finish("failed", `Factory error: ${message}`);
  } finally {
    unregisterRun(id);
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
  /** Aborted when the run is cancelled from the portal. */
  cancelSignal: AbortSignal | null = null;
  /** A feedback round's verify replaced the live container, so cancelling must put the old one back. */
  private liveReplaced = false;
  /** Set during a feedback round on a deployed app. */
  private revision: { changes: string[]; feedback: string; n: number } | null = null;
  /** Spend and budget of earlier rounds, so the run shows its total. */
  private costOffset = 0;
  private budgetOffset = 0;
  /** The customer's answers before the spec, passed to every requirements session. */
  private researchAnswers: string | null = null;
  /** Set when the customer let a checkpoint time out: later checkpoints don't wait. */
  private customerAbsent = false;
  /** Testability, scope and coverage problems the PRD gates found (repaired or only reported, per PRD_GATES). */
  private prdGateIssues: string[] = [];
  /** The independent tester's suite, installed into the workspace once development is done. */
  private acceptanceSuite: Acceptance | null = null;
  /** Workspace commit holding the acceptance suite as the tester (or triage) left it. */
  private acceptanceCommit: string | null = null;
  /** Changes other agents made to acceptance/ that the factory put back. */
  private readonly acceptanceViolations: string[] = [];
  /** The last full verify's acceptance result, for SUMMARY.md. */
  private lastAcceptance: GateResult["acceptance"] = null;
  /** The developer's latest session, resumed by fix rounds so they start with full context. */
  private devSessionId: string | null = null;
  /** Workspace commit the live container was built from. */
  private deployedCommit: string | null = null;
  /** Lessons repair agents reported, kept until a later verify or review proves (or disproves) the fix. */
  private pendingLessons: PendingLesson[] = [];
  /** Feature groups a development built in parts never got to; the run can't count as fully deployed. */
  private unbuilt: string[] = [];
  /** Finished steps of an interrupted run, answered from disk instead of run again. */
  private journal: Journal | null = null;
  /** Highest stage number already used, so new stage folders never collide with the old ones. */
  private seqFloor = 0;

  constructor(
    private readonly id: string,
    private readonly prompt: string,
    private readonly paths: RunPaths,
    private readonly designSystem: DesignSystem,
    private readonly interactive: boolean = true,
  ) {
    this.budget = createBudget({ capUsd: config.RUN_BUDGET_USD, deployReserveUsd: DEPLOY_RESERVE_USD, fixReserveUsd: FIX_RESERVE_USD });
    const port = config.PUBLIC_HTTP_PORT === 80 ? "" : `:${config.PUBLIC_HTTP_PORT}`;
    this.appUrl = `http://${id}.apps.${config.BASE_DOMAIN}${port}`;
  }

  /**
   * Builds the app: in one session for a small app (or with DEV_SLICING=off),
   * otherwise as a scaffold, one fresh session per feature group, and a
   * finish. Each feature session sees only its slice of the spec, so its
   * context stays small; every part commits, so the board, a restart and a
   * budget stop all work per feature. The parts' handoffs are merged into the
   * one development handoff verify, review and fix rounds read.
   */
  private async develop(): Promise<StepResult> {
    const slices =
      config.DEV_SLICING === "on"
        ? planSlices({
            architecture: this.handoffs.architecture,
            minSlices: config.DEV_MIN_SLICES,
            prd: this.handoffs.requirements,
            testPlan: this.handoffs.testCases,
            uiDesign: this.handoffs.uiDesign,
          })
        : null;
    if (!slices) return this.step("development");

    const budgets = sliceBudgets({ count: slices.length, poolUsd: STAGE_SETTINGS.development.budgetUsd });
    console.info("[pipeline] building in parts", { runId: this.id, slices: slices.map((s) => s.id) });
    recordActivity(this.id, "Development", `Building in ${slices.length + 2} parts: foundation, ${slices.map((s) => s.id).join(", ")}, finish`);

    // A part is a fraction of the whole build, so the whole stage's $1 minimum would refuse most of them.
    const scaffold = await this.step("development", { budgetUsd: budgets.scaffoldUsd, devPart: { kind: "scaffold" }, minUsd: PART_MIN_USD, suffix: "scaffold" });
    if (scaffold.outcome !== "succeeded") return scaffold;
    const parts: DevHandoff[] = [scaffold.handoff as DevHandoff];
    const summaries: DevPartSummary[] = [partSummary("scaffold", [], scaffold.handoff as DevHandoff)];
    const gaps: string[] = [];
    let stopped = false;
    let lastSession = scaffold.sessionId;

    for (const slice of slices) {
      const notBuilt = (why: string) => gaps.push(...slice.features.map((f) => `${f.id} ${f.name}: not built (${why})`));
      if (stopped) {
        notBuilt("development stopped before this feature group");
        continue;
      }
      const result = await this.step("development", {
        budgetUsd: budgets.featureUsd,
        devPart: { kind: "feature", previous: [...summaries], slice },
        minUsd: PART_MIN_USD,
        suffix: slice.id,
      });
      if (result.outcome === "succeeded") {
        parts.push(result.handoff as DevHandoff);
        summaries.push(partSummary(slice.id, slice.featureIds, result.handoff as DevHandoff));
        lastSession = result.sessionId ?? lastSession;
        continue;
      }
      notBuilt(isBudgetStop(result.outcome) ? "its session ran out of budget" : "its session failed");
      // Out of money: later groups would only fail the same way. A failed session may be a one-off, so carry on.
      if (isBudgetStop(result.outcome)) stopped = true;
    }

    // The finish runs whatever happened above: it seeds, checks every screen and reports the final commands.
    const finish = await this.step("development", {
      budgetUsd: budgets.finishUsd,
      devPart: { kind: "finish", previous: summaries },
      minUsd: PART_MIN_USD,
      suffix: "finish",
    });
    if (finish.outcome === "succeeded") parts.push(finish.handoff as DevHandoff);

    this.unbuilt = gaps;
    // Named next to whatever stopped the build, so the customer sees which features are missing, not only why.
    if (gaps.length) this.stopReason = [this.stopReason, `Not built: ${gaps.join("; ")}`].filter(Boolean).join(". ");
    const merged = mergeDevHandoffs(parts, { extraGaps: gaps });
    this.handoffs.development = merged;
    await this.updateBoard("development", "Development", merged);
    return { handoff: merged, outcome: "succeeded", sessionId: finish.sessionId ?? lastSession };
  }

  /**
   * Continues a run cut off by a restart. Uncommitted changes of the
   * interrupted step are dropped (that step runs again from its start), and
   * the orchestration runs once more with every finished agent step replayed
   * from disk. Spend already made is counted again from the stage records, so
   * the budget picks up where it was.
   */
  async resume(): Promise<void> {
    const stages = RunsStore.listStages(this.id);
    const entries = await loadJournal(this.paths, stages);
    this.journal = new Journal(entries);
    this.seqFloor = Math.max(0, ...stages.map((s) => s.seq));
    await resetWorkspace(this.paths);
    console.info("[pipeline] resuming after restart", { replayable: entries.length, runId: this.id, stages: stages.length });
    recordActivity(this.id, "Factory", `Resumed after a restart; reusing ${entries.length} finished steps`);
    RunsStore.updateRun(this.id, { stopReason: null });
    await this.run();
  }

  /** The next stage number: after both this session's stages and any left from before a restart. */
  private nextSeq(): number {
    this.seq = Math.max(this.seq, this.seqFloor) + 1;
    return this.seq;
  }

  /** A finished step from before the restart: its result, without running or paying for it again. */
  private replay(stageKey: AgentStageKey, label: string, entry: JournalEntry): StepResult {
    this.budget = recordSpend(this.budget, { costUsd: entry.costUsd });
    RunsStore.updateRun(this.id, { costUsd: this.costOffset + this.budget.spentUsd });
    if (entry.outcome === "succeeded") {
      this.handoffs[stageKey] = entry.handoff;
      if (LESSON_STAGES.has(stageKey)) this.collectLessons(label, entry.handoff);
    }
    if (entry.outcome === "stopped_budget") this.stopReason ??= `${label}: stopped at its budget (before the restart)`;
    return { handoff: entry.outcome === "succeeded" ? entry.handoff : null, outcome: entry.outcome, sessionId: entry.sessionId };
  }

  async run(): Promise<void> {
    await this.writeRunJson("running");

    // Research is helpful but not essential: if it fails, requirements are
    // written from the prompt alone. A budget stop still ends the run at the
    // next step.
    const research = await this.step("research");
    if (research.outcome === "succeeded") await this.askBeforeSpec(research.handoff);

    const requirements = await this.step("requirements", { customerInput: this.researchAnswers });
    if (requirements.outcome !== "succeeded") return this.stop(requirements, "Requirements failed");
    await this.gatePrd(requirements.sessionId);

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

    // The independent tester writes black-box tests from the same contract
    // while the developer builds, so it adds no waiting time. It starts first:
    // allowances are claimed in call order, and the developer asks for more
    // than a $10 run has left after the reserves, so started second the
    // tester was refused in almost every run.
    const [, dev] = await Promise.all([this.writeAcceptanceTests(), this.develop()]);
    this.devSessionId = dev.sessionId;
    if (!(await workspaceHasFile(this.paths, "Dockerfile"))) {
      return this.stop(dev, "Development produced no deployable app (no Dockerfile)");
    }
    await this.installAcceptanceSuite();

    const { clean, lastGate } = await this.verifyAndFix();
    const healthy = await this.ensureDeployed(lastGate);
    if (!healthy) {
      return this.finish(
        this.stopReason ? "failed_budget" : "failed",
        this.stopReason ?? "The app never passed its /health check",
      );
    }

    RunsStore.updateRun(this.id, { appUrl: this.appUrl });
    // Checks can pass on an app missing whole feature groups (their tests were never written), so those count against "clean".
    const complete = clean && this.unbuilt.length === 0;
    return this.finish(complete ? "deployed" : "deployed_partial", complete ? null : this.stopReason ?? "Shipped with unresolved issues");
  }

  /**
   * The PRD gates, before ~$4.50 of design and development is built on it:
   * cross-references, testability and scope are checked by code (free), and
   * an independent reviewer checks it covers what the customer asked (about
   * $0.05-0.10). Problems get one resumed repair of the requirements session:
   * cheap, because the agent already has its PRD in context. Cross-reference
   * problems are always repaired; the other gates only with PRD_GATES=repair,
   * otherwise they are reported. Nothing here stops the run.
   */
  private async gatePrd(sessionId: string | null): Promise<void> {
    const prd = asPrd(this.handoffs.requirements);
    const references = prd ? validatePrd(prd) : [];
    const quality = prd ? checkPrdQuality(prd) : { scope: [], testability: [] };
    const review = await this.step("prdReview");
    const coverage = review.outcome === "succeeded" ? coverageIssues(review.handoff as PrdReview) : [];
    this.prdGateIssues = [...quality.testability, ...quality.scope, ...coverage];

    // At the checkpoint the customer decides the coverage gaps themselves, so
    // they leave the automatic repair list; their answers come in as feedback.
    const feedback = prd ? await this.askAboutSpec(prd, review.outcome === "succeeded" ? (review.handoff as PrdReview) : null) : null;
    const gateIssues = feedback === undefined ? this.prdGateIssues : [...quality.testability, ...quality.scope];
    const issues = config.PRD_GATES === "repair" ? [...references, ...gateIssues] : references;
    console.info("[pipeline] PRD gates", { coverage: coverage.length, customerFeedback: Boolean(feedback), mode: config.PRD_GATES, references: references.length, runId: this.id, scope: quality.scope.length, testability: quality.testability.length });
    if (issues.length === 0 && !feedback) return;
    await this.step("requirements", {
      budgetUsd: PRD_REPAIR_BUDGET_USD,
      customerInput: [this.researchAnswers, feedback].filter(Boolean).join("\n\n") || null,
      repairIssues: issues,
      resumeSessionId: sessionId,
      suffix: "repair",
    });
  }

  /** Checkpoint 1: the researcher's questions, answered before the spec is written. */
  private async askBeforeSpec(research: unknown): Promise<void> {
    const items = researchQuestions(research);
    if (!items.length || !this.canAsk("research")) return;
    const result = await this.ask("research", items);
    this.researchAnswers = renderResearchAnswers(items, result);
  }

  /**
   * Checkpoint 2: the spec review. Returns the feedback for the repair (null
   * when nothing changes), or undefined when the checkpoint didn't run.
   */
  private async askAboutSpec(prd: Prd, review: PrdReview | null): Promise<string | null | undefined> {
    const items = prdQuestions(prd, review, config.PRD_GATES);
    // Nothing to ask means no pause, except in a feedback round, where the customer confirms the changes.
    if ((!items.length && !this.revision) || !this.canAsk("prd")) return undefined;
    const result = await this.ask("prd", items, { ...prdContext(prd), changes: this.revision?.changes ?? null });
    return renderPrdFeedback(items, result);
  }

  private canAsk(checkpoint: Checkpoint): boolean {
    if (config.CUSTOMER_QUESTIONS !== "on" || !this.interactive) return false;
    // Watching is checked live at each checkpoint, so someone who opens the page later is still asked.
    if (config.CUSTOMER_WAIT_ONLY_IF_WATCHING === "on") return true;
    // Otherwise: a customer who didn't answer the first time isn't watching; don't make the run wait twice.
    return !(checkpoint === "prd" && this.customerAbsent);
  }

  private async ask(checkpoint: Checkpoint, items: Question[], context: PrdCheckpointContext | null = null): Promise<CheckpointResult> {
    const timeoutMs = config.CUSTOMER_TIMEOUT_MINUTES * 60_000;
    const until = new Date(Date.now() + timeoutMs).toISOString().slice(11, 16);
    // Watching means the build's page polled within the last 10 s; leaving it for a minute ends the wait.
    const onlyWhileWatched = config.CUSTOMER_WAIT_ONLY_IF_WATCHING === "on" ? WATCH_WINDOWS : null;
    const watched = !onlyWhileWatched || isWatched(this.id, WATCH_WINDOWS.startMs);
    recordActivity(
      this.id,
      "Customer",
      watched ? `Waiting for your answers; continuing on its own at ${until} UTC` : "Questions ready, but nobody has this build open; continuing with the agents' choices",
    );
    if (watched) await this.writeRunJson("waiting_customer");
    const result = await askCustomer(this.id, { checkpoint, context, items, onlyWhileWatched, resume: this.journal !== null, timeoutMs });
    if (result.closedBy === "timeout") this.customerAbsent = true;
    if (watched) {
      recordActivity(this.id, "Customer", result.closedBy === "customer" ? "Thanks — answers received" : "No answer; continuing with the agents' own choices");
    }
    await this.writeRunJson("running");
    return result;
  }

  /**
   * Verify (free, deterministic) and review (LLM, read-only) run in parallel.
   * Whatever fails gets the cheapest agent that can fix it: deployment repair
   * for a broken container, test triage for failing tests, and a resumed
   * developer session only for real app bugs or blocking review findings.
   */
  private async verifyAndFix(
    { reviewedSince = null }: { reviewedSince?: string | null } = {},
  ): Promise<{ clean: boolean; lastGate: GateResult | null }> {
    // A feedback round reviews only its own changes: the live version was reviewed before.
    let previousReview: ReviewHandoff | null = reviewedSince ? { blocking: false, findings: [] } : null;
    let reviewedCommit: string | null = reviewedSince;
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
      if (gate.failedSteps.includes("tests") || gate.failedSteps.includes("acceptance")) {
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
    throwIfCancelled(this.id);
    // Verify builds and starts the app in the live container; a cancelled feedback round must put the old one back.
    if (this.revision) this.liveReplaced = true;
    // Sequence number is taken synchronously so a parallel stage can't reuse it.
    const seq = this.nextSeq();
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
      acceptanceMode: config.ACCEPTANCE_MODE,
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
    if (gate.acceptance) this.lastAcceptance = gate.acceptance;
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

  /**
   * Runs the acceptance tester, checks its files parse (one resumed repair if
   * not) and keeps the suite for installation once development is done.
   * Never stops the run: without a suite, verify simply has no acceptance step.
   */
  private async writeAcceptanceTests(suffix?: string): Promise<void> {
    const first = await this.step("acceptance", { suffix });
    if (first.outcome !== "succeeded") return;
    let suite = first.handoff as Acceptance;
    let issues = await checkAcceptanceFiles(suite, await mkdtemp(join(tmpdir(), "acceptance-")));
    if (issues.length) {
      const repair = await this.step("acceptance", {
        budgetUsd: ACCEPTANCE_REPAIR_BUDGET_USD,
        repairIssues: issues,
        resumeSessionId: first.sessionId,
        suffix: suffix ? `${suffix}-repair` : "repair",
      });
      if (repair.outcome === "succeeded") {
        suite = repair.handoff as Acceptance;
        issues = await checkAcceptanceFiles(suite, await mkdtemp(join(tmpdir(), "acceptance-")));
      }
    }
    // A file that still doesn't parse would fail as a whole; leave it out and say so.
    const broken = new Set(issues.map((issue) => issue.split(":")[0]));
    if (broken.size) console.info("[pipeline] acceptance files left out", { files: [...broken], runId: this.id });
    this.acceptanceSuite = { ...suite, files: suite.files.filter((f) => !broken.has(f.path)) };
  }

  private async installAcceptanceSuite(): Promise<void> {
    if (!this.acceptanceSuite?.files.length) return;
    // A resumed run already has the suite committed, possibly with test triage's fixes: keep it, don't reinstall.
    if (this.journal && (await workspaceHasFile(this.paths, `${ACCEPTANCE_DIR}/harness.mjs`))) {
      this.acceptanceCommit = await headCommit(this.paths);
      return;
    }
    recordActivity(this.id, VERIFY_LABEL, `Adding ${this.acceptanceSuite.files.length} acceptance test files to the workspace`);
    this.acceptanceCommit = await installAcceptance(this.paths, this.acceptanceSuite);
  }

  private async step(stageKey: AgentStageKey, options: StepOptions = {}): Promise<StepResult> {
    throwIfCancelled(this.id);
    const settings = STAGE_SETTINGS[stageKey];
    const label = options.fix
      ? `Fix ${options.fix.attempt}`
      : options.suffix
        ? `${settings.label} (${options.suffix})`
        : settings.label;

    const replayed = this.journal?.take(stageKey, label);
    if (replayed) return this.replay(stageKey, label, replayed);

    // Everything up to the first await runs synchronously, so two steps
    // started with Promise.all can't both claim the same money or sequence number.
    const decision = decideAllowance({
      access: reserveAccess(stageKey, options),
      budget: this.budget,
      minUsd: options.minUsd ?? settings.minUsd,
      requestedUsd: options.budgetUsd ?? settings.budgetUsd,
    });
    if (decision.kind === "stop") {
      console.info("[pipeline] early stop", { reason: decision.reason, runId: this.id, stageKey });
      this.stopReason ??= `Stopped before ${label}: ${decision.reason}`;
      return { handoff: null, outcome: "not_started", sessionId: null };
    }
    this.budget = commitAllowance(this.budget, decision.allowanceUsd);
    const seq = this.nextSeq();
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
      lessons: this.lessonsFor(stageKey, options, label),
      librarianToolsets: toolsets,
      libraryIndex: this.libraryIndexFor(stageKey, options, label),
      customerInput: options.customerInput ?? null,
      devPart: options.devPart ?? null,
      repairIssues: options.repairIssues ?? null,
      revision: this.revision,
      rereview: options.rereview ?? null,
      resumed: false,
      runId: this.id,
      stageDir: sp.dir,
      userPrompt: this.prompt,
      workspaceDir: this.paths.workspace,
    };
    const agent = agentFor(stageKey, this.designSystem);
    const resuming = Boolean(options.resumeSessionId);
    // In a feedback round, stages without their own revise mode update their previous output.
    const previous = this.revision && REVISED_BY_DELTA.has(stageKey) ? this.handoffs[stageKey] : undefined;
    const promptFor = (resumed: boolean) => {
      const base = agent.buildPrompt({ ...ctx, resumed });
      return previous && !options.repairIssues ? `${base}\n\n${reviseBlock(this.revision!, previous)}` : base;
    };

    const librarian = librarianMcpServer({
      handoffs: this.handoffs,
      runId: this.id,
      stage: label,
      stageKey,
      workspaceDir: this.paths.workspace,
    });

    const result = await runStage({
      allowanceUsd: decision.allowanceUsd,
      cancelSignal: this.cancelSignal ?? undefined,
      allowedTools: [...agent.allowedTools, ...librarianToolNames(stageKey)],
      cwd: agent.cwd(ctx),
      freshPrompt: promptFor(false),
      hooks: librarianHooks({ runId: this.id, stage: label, stageKey }),
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
    RunsStore.updateRun(this.id, { costUsd: this.costOffset + this.budget.spentUsd });
    if (WORKSPACE_STAGES.has(stageKey)) await commitWorkspace(this.paths, `${sp.dirName}: ${label}`);
    await this.guardAcceptance(stageKey, label);

    if (result.outcome === "succeeded") {
      this.handoffs[stageKey] = result.handoff;
      await this.updateBoard(stageKey, label, result.handoff, options.devPart);
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
    // The stage is recorded (with what it cost) before a cancellation ends the run.
    throwIfCancelled(this.id);
    return { handoff: result.handoff, outcome: result.outcome, sessionId: result.sessionId };
  }

  /**
   * The acceptance suite is the independent check, so the developer and the
   * deployment repair agent may read it but never change it: anything they
   * touched is put back. Test triage may fix tests that contradict the
   * contract, so its changes become the new baseline.
   */
  private async guardAcceptance(stageKey: AgentStageKey, label: string): Promise<void> {
    if (!this.acceptanceCommit) return;
    if (stageKey === "testing") {
      this.acceptanceCommit = await headCommit(this.paths);
      return;
    }
    if (stageKey !== "development" && stageKey !== "deployment") return;
    const restored = await protectAcceptance(this.paths, this.acceptanceCommit);
    if (!restored.length) return;
    this.acceptanceViolations.push(`${label} changed ${restored.join(", ")}; restored`);
    console.info("[pipeline] acceptance tests restored", { label, restored, runId: this.id });
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

  /**
   * Lessons pushed into a prompt, so the agent gets them without spending a
   * turn: container traps for the architect, this stack's most common traps
   * for the first build, and lessons matching the exact failure for repairs.
   */
  private lessonsFor(stageKey: AgentStageKey, options: StepOptions, label: string): StageContext["lessons"] {
    if (config.LIBRARIAN === "off") return [];
    try {
      const pick = (): { lessons: StageContext["lessons"]; query: string } => {
        if (stageKey === "architecture") {
          return { lessons: LibrarianService.rankedLessons({ designSystem: this.designSystem, limit: 3, steps: ["build", "run", "health"], tags: [] }), query: "container traps" };
        }
        // Building in parts: the scaffold sets up the stack, so it gets the stack's traps; later parts don't need them again.
        if (stageKey === "development" && options.devPart && options.devPart.kind !== "scaffold") return { lessons: [], query: "" };
        if (stageKey === "development" && !options.fix) {
          const tags = LibrarianService.stackTags(this.handoffs.architecture);
          return { lessons: LibrarianService.rankedLessons({ designSystem: this.designSystem, tags }), query: `stack: ${tags.join(", ")}` };
        }
        if (stageKey === "development" || stageKey === "testing" || stageKey === "deployment") {
          const gate = options.fix?.gate ?? options.gate ?? null;
          const review = (options.fix?.review ?? null) as Parameters<typeof LibrarianService.lessonsForFailure>[0]["review"];
          return { lessons: LibrarianService.lessonsForFailure({ gate, review }), query: `failure: ${gate?.failedSteps.join(", ") ?? ""}${review ? " + review" : ""}` };
        }
        return { lessons: [], query: "" };
      };
      const { lessons, query } = pick();
      if (query) this.logPush(label, "auto:lessons", query, lessons.map((l) => `lesson:${l.id}`));
      return lessons;
    } catch (error) {
      console.error("[pipeline] reading lessons failed", { message: error instanceof Error ? error.message : String(error), runId: this.id });
      return [];
    }
  }

  /** The architect chooses libraries and the first build writes common modules: both see what the librarian holds. */
  private libraryIndexFor(stageKey: AgentStageKey, options: StepOptions, label: string): StageContext["libraryIndex"] {
    if (config.LIBRARIAN === "off") return null;
    if (stageKey !== "architecture" && !(stageKey === "development" && !options.fix && (!options.devPart || options.devPart.kind === "scaffold"))) return null;
    try {
      const catalog = LibrarianStore.listCatalog(10);
      this.logPush(label, "auto:catalog", "catalog list", catalog.map((c) => `catalog:${c.name}`));
      return { catalog, docs: LibrarianStore.listLibraries() };
    } catch (error) {
      console.error("[pipeline] reading the library index failed", { message: error instanceof Error ? error.message : String(error), runId: this.id });
      return null;
    }
  }

  private logPush(stage: string, tool: string, query: string, results: string[]): void {
    LibrarianStore.logQuery({ at: new Date().toISOString(), hits: results.length, query, results, runId: this.id, stage, tool });
  }

  /** Moves board cards from a finished stage's handoff. */
  private async updateBoard(stageKey: AgentStageKey, label: string, handoff: unknown, devPart?: DevPartContext): Promise<void> {
    await BoardService.safely(stageKey, () => {
      const stamp = { actor: label };
      if (stageKey === "requirements") BoardService.onRequirements(this.id, handoff, stamp);
      if (stageKey === "testCases") BoardService.onTestPlan(this.id, handoff, this.handoffs.requirements, stamp);
      if (stageKey === "development") {
        // A feature group's session speaks only for its own features; scaffold and finish for none.
        const scope = !devPart ? undefined : devPart.kind === "feature" ? devPart.slice.featureIds : "none";
        BoardService.onDevelopmentDone(this.id, handoff, stamp, scope);
      }
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
      budgetUsd: this.budgetOffset + this.budget.capUsd,
      currentStage: run?.currentStage ?? null,
      id: this.id,
      revision: this.revision?.n ?? null,
      spentUsd: this.costOffset + this.budget.spentUsd,
      stages: RunsStore.listStages(this.id),
      status,
      stopReason,
    });
  }

  /**
   * A feedback round on a deployed app: the same run, URL and code, updated
   * from the stored spec, contract, tests and the developer's handoff. Each
   * stage updates its previous output instead of starting over; the old app
   * stays live until the new one passes, and comes back if it doesn't.
   */
  async revise({ feedback, n }: { feedback: string; n: number }): Promise<void> {
    const run = RunsStore.getRun(this.id);
    this.costOffset = run?.costUsd ?? 0;
    this.budgetOffset = run?.budgetUsd ?? 0;
    // A feedback round is small; a full fix reserve would starve its build, so it holds a fifth of the budget.
    this.budget = createBudget({
      capUsd: config.REVISION_BUDGET_USD,
      deployReserveUsd: DEPLOY_RESERVE_USD,
      fixReserveUsd: Math.min(FIX_RESERVE_USD, config.REVISION_BUDGET_USD * 0.2),
    });
    this.revision = { changes: [], feedback, n };
    RunsStore.updateRun(this.id, { budgetUsd: this.budgetOffset + config.REVISION_BUDGET_USD, status: "running", stopReason: null });
    RevisionsStore.updateRevision(this.id, n, { status: "running" });
    await this.reload();
    await this.writeRunJson("running");
    const suffix = `r${n}`;

    const before = asPrd(this.handoffs.requirements);
    if (!before) return this.finishRevision({ deployed: false, note: "This run has no stored spec to revise" });
    const requirements = await this.step("requirements", { suffix });
    if (requirements.outcome !== "succeeded") return this.finishRevision({ deployed: false, note: "Updating the spec failed" });
    this.revision.changes = this.describeChanges(before);
    await this.gatePrd(requirements.sessionId);
    this.revision.changes = this.describeChanges(before);
    await BoardService.safely("revision", () => {
      const after = asPrd(this.handoffs.requirements);
      if (after) BoardService.onRevision(this.id, prdDiff(before, after), { actor: `Feedback round ${n}` });
    });

    const [testCases, architecture] = await Promise.all([
      this.step("testCases", { suffix }),
      this.step("architecture", { suffix }),
      this.step("uiDesign", { suffix }),
    ]);
    if (testCases.outcome !== "succeeded" || architecture.outcome !== "succeeded") {
      return this.finishRevision({ deployed: false, note: "Updating the test plan or architecture failed" });
    }

    const reviewedSince = await headCommit(this.paths);
    // Tester first, so its allowance is claimed before the developer's (see execute).
    const [, dev] = await Promise.all([
      this.writeAcceptanceTests(suffix),
      this.step("development", { budgetUsd: REVISION_DEV_BUDGET_USD, suffix }),
    ]);
    this.devSessionId = dev.sessionId;
    if (dev.outcome === "not_started") return this.finishRevision({ deployed: false, note: this.stopReason ?? "No budget left for the change" });
    await this.installAcceptanceSuite();

    const { clean, lastGate } = await this.verifyAndFix({ reviewedSince });
    if (await this.ensureDeployed(lastGate)) {
      return this.finishRevision({ clean, deployed: true, note: clean ? null : (this.stopReason ?? "Shipped with unresolved issues") });
    }
    // The new version never became healthy: put the previous one back.
    recordActivity(this.id, VERIFY_LABEL, "The new version failed; restoring the previous one");
    await callDeployer("/rollback", { port: APP_PORT, runId: this.id });
    const restored = await this.verifyHealth();
    return this.finishRevision({ deployed: false, note: this.stopReason ?? "The new version never passed its /health check", restored });
  }

  /** A cancelled feedback round: the previous version stays live (restored if verify had replaced it). */
  async cancelRevision(): Promise<void> {
    let restored = true;
    if (this.liveReplaced) {
      await callDeployer("/rollback", { port: APP_PORT, runId: this.id });
      restored = await this.verifyHealth();
    }
    return this.finishRevision({ deployed: false, note: "Cancelled by the user", restored });
  }

  async finishRevision({
    clean = true,
    deployed,
    note,
    restored = true,
  }: {
    clean?: boolean;
    deployed: boolean;
    note: string | null;
    restored?: boolean;
  }): Promise<void> {
    const n = this.revision?.n ?? 0;
    RevisionsStore.updateRevision(this.id, n, { costUsd: this.budget.spentUsd, note, status: deployed ? "deployed" : "failed" });
    if (deployed) return this.finish(clean ? "deployed" : "deployed_partial", note);
    // A failed feedback round doesn't take the app down: the previous version stays (or is put back) live.
    return this.finish(
      restored ? "deployed" : "failed",
      `Feedback round ${n} failed: ${note ?? "unknown error"}. ${restored ? "The previous version is still live." : "The previous version could not be restored."}`,
    );
  }

  /** Reloads what a finished run stored: each stage's latest handoff, the sequence, and the live commit. */
  private async reload(): Promise<void> {
    const stages = RunsStore.listStages(this.id);
    this.seq = stages.reduce((max, s) => Math.max(max, s.seq), 0);
    const development: DevHandoff[] = [];
    let builtInParts = false;
    for (const stage of stages) {
      if (stage.status !== "succeeded" || stage.stageKey === "verify") continue;
      const text = await readFile(join(this.paths.stages, stage.dirName, "handoff.json"), "utf8").catch(() => null);
      if (!text) continue;
      this.handoffs[stage.stageKey as AgentStageKey] = JSON.parse(text) as unknown;
      if (stage.stageKey === "development") {
        development.push(JSON.parse(text) as DevHandoff);
        if (/^Development \((scaffold|finish|F-[\d+F-]+)\)$/.test(stage.label)) builtInParts = true;
      }
    }
    // Built in parts, the last development handoff is only the finish: rebuild the whole picture from every part, fix and change round.
    if (builtInParts) this.handoffs.development = mergeDevHandoffs(development);
    this.deployedCommit = await headCommit(this.paths);
    this.acceptanceCommit = (await workspaceHasFile(this.paths, "acceptance/harness.mjs")) ? this.deployedCommit : null;
  }

  private describeChanges(before: Prd): string[] {
    const after = asPrd(this.handoffs.requirements);
    return after ? describePrdDiff(prdDiff(before, after), before, after) : [];
  }

  private renderCustomerSummary(): string {
    const checkpoints = QuestionsStore.listCheckpoints(this.id).filter((c) => c.answers);
    if (!checkpoints.length) return "";
    const sections = checkpoints.map((c) => {
      const byId = new Map((c.answers ?? []).map((a) => [a.id, a]));
      const rows = c.items.map((q) => {
        const a = byId.get(q.id);
        return `| ${cell(q.question)} | ${cell(a?.value ?? q.default)} | ${a?.answeredBy === "customer" ? "customer" : "agent (no answer)"} |`;
      });
      const title = c.checkpoint === "research" ? "Before the spec" : "Spec review";
      const how = c.closedBy === "customer" ? "answered by the customer" : "timed out; the agents' choices were used";
      return `### ${title} (${how})\n\n| Question | Answer | Decided by |\n|---|---|---|\n${rows.join("\n")}${c.feedback ? `\n\nThe customer added: ${c.feedback}` : ""}`;
    });
    return `\n## Customer questions\n\n${sections.join("\n\n")}\n`;
  }

  private renderPrdGateSummary(): string {
    if (!this.prdGateIssues.length) return "";
    const how = config.PRD_GATES === "repair" ? "sent back to the requirements agent in its repair round" : "reported only (PRD_GATES=advisory)";
    return `\n## PRD gates\n\n${this.prdGateIssues.length} testability, scope or coverage problem(s), ${how}. See the PRD and PRD check reports.\n`;
  }

  private renderAcceptanceSummary(): string {
    const a = this.lastAcceptance;
    if (!a && !this.acceptanceViolations.length) return "";
    const result = !a
      ? "not run"
      : a.skipped
        ? a.skipped
        : `${a.passed} passed, ${a.failed} failed (${a.mode}${a.mode === "advisory" && a.failed ? ": reported, did not fail the build" : ""})`;
    const violations = this.acceptanceViolations.length ? `\n\nRestored after other agents changed them: ${this.acceptanceViolations.join("; ")}.` : "";
    return `\n## Acceptance tests (independent)\n\n${result}${violations}\n`;
  }

  private renderSummary(status: RunStatus, stopReason: string | null): string {
    const stages = RunsStore.listStages(this.id);
    const rows = stages
      .map((s) => `| ${s.seq} | ${s.label} | ${s.status} | $${s.costUsd.toFixed(2)} | [REPORT](stages/${s.dirName}/REPORT.md) |`)
      .join("\n");
    const app = RunsStore.getRun(this.id)?.appUrl;
    const librarian = LibrarianStore.queryStats(this.id)
      .map((s) => `| ${s.stage} | ${s.pulls} | ${s.withHits} | ${s.auto} | ${s.capped} |`)
      .join("\n");
    return `# Run ${this.id}

**Status:** ${status}${stopReason ? `  \n**Stop reason:** ${stopReason}` : ""}${app ? `  \n**App:** ${app}` : ""}  \n**Spend:** $${(this.costOffset + this.budget.spentUsd).toFixed(2)} of $${(this.budgetOffset + this.budget.capUsd).toFixed(2)}${this.revision ? ` (feedback round ${this.revision.n}: $${this.budget.spentUsd.toFixed(2)})` : ""}

## Prompt

${this.prompt}

## Stages

| # | Stage | Status | Cost | Report |
|---|---|---|---|---|
${rows}
${this.renderCustomerSummary()}${this.renderPrdGateSummary()}${this.renderAcceptanceSummary()}${librarian ? `\n## Librarian\n\n| Stage | Asked | With hits | Auto | Hit cap |\n|---|---|---|---|---|\n${librarian}\n\n"Asked" are the agent's own lookups; "Auto" is knowledge the factory handed over in the prompt or after a tool call.\n` : ""}
"Verify" stages are the factory's own automated checks (tests, image build, container health, smoke checks) and cost nothing. Agent stage folders also hold \`handoff.json\` (what later agents received), \`input-prompt.md\` (what the agent was asked), \`transcript.jsonl\` (full agent trace) and \`meta.json\` (model, skills, tokens, cost, resumed session). Per-stage code changes: \`git -C workspace log -p\`.
`;
  }
}

/** Below this a development part can't do meaningful work; it stops instead (and later feature groups are skipped). */
const PART_MIN_USD = 0.4;

/** What a development part hands to the parts after it. */
function partSummary(id: string, featureIds: string[], handoff: DevHandoff): DevPartSummary {
  return {
    featureIds,
    id,
    knownGaps: handoff.knownGaps ?? [],
    notes: handoff.notes ?? "",
    screens: (handoff.screens ?? []).map(({ path, screenId }) => ({ path, screenId })),
  };
}

/** Fix-round work may spend the fix reserve; deployment repair may spend everything. */
function reserveAccess(stageKey: AgentStageKey, options: StepOptions): ReserveAccess {
  if (stageKey === "deployment") return "deploy";
  if (options.fix || stageKey === "testing" || options.rereview) return "repair";
  return "build";
}

function isBudgetStop(outcome: StepOutcome): boolean {
  return outcome === "stopped_budget" || outcome === "not_started";
}

function cell(text: string): string {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Someone is watching if the build's page polled within 10 s; a minute away ends the wait. */
const WATCH_WINDOWS = { leaveMs: 60_000, startMs: 10_000 };

/** Stages that revise by updating their previous output; requirements and development have their own revise prompts. */
const REVISED_BY_DELTA = new Set<AgentStageKey>(["testCases", "architecture", "uiDesign", "acceptance"]);

function reviseBlock(revision: { changes: string[]; feedback: string; n: number }, previous: unknown): string {
  return `## This is a revision of a live app

The customer gave feedback on the deployed app: "${revision.feedback}". The PRD above is the updated version. What changed:
${revision.changes.length ? revision.changes.map((c) => `- ${c}`).join("\n") : "- (no spec items changed; the feedback concerns existing behaviour)"}

Your previous output for this app is below. Return the complete updated output: keep everything the changes don't touch exactly as it was (same ids, same wording, same values), and change or add only what the changed items need. New ids continue the numbering.

${jsonBlock("Your previous output", previous)}`;
}
