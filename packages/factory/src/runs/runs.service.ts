import * as BoardService from "../board/board.service";
import { config } from "../lib/config";
import { NotFoundError, TooManyRequestsError, ValidationError } from "../lib/errors";
import { recentActivity } from "../pipeline/pipeline.activity";
import { readStageReport, runPaths } from "../pipeline/pipeline.artifacts";
import { executeRun } from "../pipeline/pipeline.service";
import { createRunSchema, runIdSchema } from "./runs.dto";
import * as RunsStore from "./runs.store";

export async function createRun({ benchmarkToken, body, ip }: { benchmarkToken?: string | null; body: unknown; ip: string }) {
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);

  const since = startOfUtcDay();
  // The benchmark submits a fixed prompt set in one go; it still counts against the daily spend cap below.
  const benchmark = Boolean(config.BENCHMARK_TOKEN) && benchmarkToken === config.BENCHMARK_TOKEN;
  if (!benchmark && RunsStore.countRunsByIpSince(ip, since) >= config.RUNS_PER_IP_PER_DAY) {
    throw new TooManyRequestsError(`Limit of ${config.RUNS_PER_IP_PER_DAY} builds per day reached. Try again tomorrow.`);
  }
  // Each queued run may still spend a full budget, so count it against the cap up front.
  const committed = RunsStore.spendSinceUsd(since) + RunsStore.countRunning() * config.RUN_BUDGET_USD;
  if (committed + config.RUN_BUDGET_USD > config.DAILY_SPEND_CAP_USD) {
    throw new TooManyRequestsError("The factory has reached today's spending limit. Try again tomorrow.");
  }

  const id = newRunId();
  RunsStore.insertRun({
    budgetUsd: config.RUN_BUDGET_USD,
    designSystem: parsed.data.designSystem,
    id,
    ip,
    prompt: parsed.data.prompt,
  });
  void drainQueue();
  return { id };
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
    stages: RunsStore.listStages(run.id),
    status: run.status,
    stopReason: run.stopReason,
  };
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
  const interrupted = RunsStore.failInterruptedRuns();
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
      void executeRun({ designSystem: run.designSystem, id: run.id, prompt: run.prompt }).finally(() => void drainQueue());
    }
  } finally {
    draining = false;
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
