import * as BoardService from "../board/board.service";
import { config } from "../lib/config";
import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from "../lib/errors";
import { recentActivity } from "../pipeline/pipeline.activity";
import { readStageReport, runPaths } from "../pipeline/pipeline.artifacts";
import { executeRun } from "../pipeline/pipeline.service";
import * as QuestionsService from "../questions/questions.service";
import * as QuestionsStore from "../questions/questions.store";
import * as RevisionsStore from "../revisions/revisions.store";
import { answerSchema, createRunSchema, feedbackSchema, runIdSchema } from "./runs.dto";
import * as RunsStore from "./runs.store";

export async function createRun({ benchmarkToken, body, ip }: { benchmarkToken?: string | null; body: unknown; ip: string }) {
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);

  // The benchmark submits a fixed prompt set in one go; it still counts against the daily spend cap.
  const benchmark = Boolean(config.BENCHMARK_TOKEN) && benchmarkToken === config.BENCHMARK_TOKEN;
  checkLimits({ budgetUsd: config.RUN_BUDGET_USD, ip, skipIpLimit: benchmark });

  const id = newRunId();
  RunsStore.insertRun({
    budgetUsd: config.RUN_BUDGET_USD,
    designSystem: parsed.data.designSystem,
    id,
    interactive: parsed.data.interactive,
    ip,
    prompt: parsed.data.prompt,
  });
  void drainQueue();
  return { id };
}

/**
 * Feedback on a deployed app starts a revision: the same run, URL and code,
 * rebuilt from the run's stored spec, contract and tests. It must be within
 * the per-IP limit and the daily spend cap, and spends its own budget.
 */
export function submitFeedback({ body, id, ip }: { body: unknown; id: string; ip: string }) {
  const run = findRun(id);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
  if (run.status !== "deployed" && run.status !== "deployed_partial") {
    throw new ConflictError("Feedback can be given once the app is deployed and no change is in progress.");
  }
  if (RevisionsStore.listRevisions(run.id).length >= config.MAX_REVISIONS) {
    throw new ConflictError(`This app has had the maximum of ${config.MAX_REVISIONS} feedback rounds. Start a new build instead.`);
  }
  checkLimits({ budgetUsd: config.REVISION_BUDGET_USD, ip, skipIpLimit: false });

  const n = RevisionsStore.addRevision(run.id, parsed.data.feedback);
  RunsStore.updateRun(run.id, { status: "queued", stopReason: null });
  void drainQueue();
  return { revision: n };
}

export function getRunDetail(id: string) {
  const run = findRun(id);
  const queuePosition = run.status === "queued" ? RunsStore.queuePosition(run.id) : null;
  return {
    activity: recentActivity(run.id),
    appUrl: run.appUrl,
    budgetUsd: run.budgetUsd,
    costUsd: run.costUsd,
    createdAt: run.createdAt,
    currentStage: run.currentStage,
    designSystem: run.designSystem,
    id: run.id,
    prompt: run.prompt,
    queuePosition,
    revisions: RevisionsStore.listRevisions(run.id),
    // Only while the run waits; the answers themselves are never sent back.
    questions: run.status === "waiting_customer" ? openQuestions(run.id) : null,
    stages: RunsStore.listStages(run.id),
    status: run.status,
    stopReason: run.stopReason,
  };
}

export function answerQuestions(id: string, body: unknown) {
  const run = findRun(id);
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
  if (run.status !== "waiting_customer") throw new ConflictError("This run isn't waiting for answers.");
  QuestionsService.answerCheckpoint(run.id, parsed.data.checkpoint, { answers: parsed.data.answers, feedback: parsed.data.feedback });
  return { ok: true };
}

function openQuestions(runId: string) {
  const open = QuestionsStore.openCheckpointOf(runId);
  if (!open) return null;
  return { checkpoint: open.checkpoint, context: open.context, deadline: open.deadline, items: open.items };
}

export async function getBoard(id: string) {
  const run = findRun(id);
  return BoardService.getBoard(run.id);
}

export async function getStageReport(id: string, dirName: string) {
  const run = findRun(id);
  const markdown = await readStageReport(runPaths(config.DATA_DIR, run.id), dirName);
  if (markdown === null) throw new NotFoundError("Report not found");
  return { dirName, markdown };
}

export function startWorker() {
  // A revision cut off by a restart leaves the previous version live: put its run back to deployed.
  const revising = RevisionsStore.runningRevisionRuns();
  const interrupted = RunsStore.failInterruptedRuns();
  RevisionsStore.failInterruptedRevisions();
  for (const runId of revising) {
    RunsStore.updateRun(runId, { status: "deployed", stopReason: "A feedback round was interrupted by a factory restart; the previous version is still live." });
  }
  if (interrupted > 0) console.info("[runs] marked interrupted runs as failed", { interrupted });
  // Polling backs up the kick in createRun, e.g. after a restart with queued runs.
  setInterval(() => void drainQueue(), 5_000);
  void drainQueue();
}

let draining = false;

async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (RunsStore.countRunning() < config.MAX_CONCURRENT_RUNS) {
      const run = RunsStore.claimNextQueuedRun();
      if (!run) break;
      console.info("[runs] starting run", { id: run.id });
      // Fire and forget: the run records its own terminal state.
      const revision = RevisionsStore.pendingRevision(run.id);
      void executeRun({
        designSystem: run.designSystem,
        id: run.id,
        interactive: run.interactive,
        prompt: run.prompt,
        revision: revision ? { feedback: revision.feedback, n: revision.n } : null,
      }).finally(() => void drainQueue());
    }
  } finally {
    draining = false;
  }
}

/** The same per-IP and daily spend limits for a new build and for a feedback round. */
function checkLimits({ budgetUsd, ip, skipIpLimit }: { budgetUsd: number; ip: string; skipIpLimit: boolean }): void {
  const since = startOfUtcDay();
  if (!skipIpLimit && RunsStore.countRunsByIpSince(ip, since) >= config.RUNS_PER_IP_PER_DAY) {
    throw new TooManyRequestsError(`Limit of ${config.RUNS_PER_IP_PER_DAY} builds per day reached. Try again tomorrow.`);
  }
  // Each queued run may still spend a full budget, so count it against the cap up front.
  const committed = RunsStore.spendSinceUsd(since) + RunsStore.countRunning() * config.RUN_BUDGET_USD;
  if (committed + budgetUsd > config.DAILY_SPEND_CAP_USD) {
    throw new TooManyRequestsError("The factory has reached today's spending limit. Try again tomorrow.");
  }
}

function findRun(id: string) {
  if (!runIdSchema.safeParse(id).success) throw new NotFoundError("Run not found");
  const run = RunsStore.getRun(id);
  if (!run) throw new NotFoundError("Run not found");
  return run;
}

function newRunId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  // First char is a letter so the subdomain never starts with a digit.
  return Array.from(bytes, (b, i) => (i === 0 ? alphabet[b % 24] : alphabet[b % alphabet.length])).join("");
}

function startOfUtcDay(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
