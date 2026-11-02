import { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { BACKUP_DIR, factoryIsRunning, SNAPSHOT_FILE } from "../lib/db.lock";

/** What the benchmark needs about one run; loaded read-only from the database and run folders. */
export type RunData = {
  /** handoff.json per stage folder, null when the stage wrote none. */
  handoffs: Record<string, unknown>;
  lessonsRecorded: number;
  librarianCalls: number;
  run: { costUsd: number; createdAt: string; id: string; status: string; updatedAt: string };
  stages: { costUsd: number; dirName: string; finishedAt: string | null; label: string; stageKey: string; startedAt: string; status: string }[];
};

export type RunMetrics = {
  acceptance: { failed: number; mode: string; passed: number; skipped: string | null } | null;
  /** Test cases the tester covered (api + e2e) of those in the plan. */
  acceptanceCoverage: { covered: number; planned: number } | null;
  costUsd: number;
  devCostUsd: number;
  devMinutes: number;
  firstVerifyFailedSteps: string[];
  firstVerifyPassed: boolean | null;
  fixRounds: number;
  lessonsRecorded: number;
  librarianCalls: number;
  minutes: number;
  /** Blocker and major findings in the first review. */
  reviewBlocking: number;
  runId: string;
  status: string;
};

type Gate = { acceptance?: { failed: number; mode: string; passed: number; skipped: string | null } | null; failedSteps?: string[]; mode?: string; passed?: boolean };

export function computeRunMetrics(data: RunData): RunMetrics {
  const minutesOf = (s: { finishedAt: string | null; startedAt: string }) =>
    s.finishedAt ? Math.max((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60_000, 0) : 0;
  const dev = data.stages.filter((s) => s.stageKey === "development");
  const verifies = data.stages.filter((s) => s.stageKey === "verify").map((s) => data.handoffs[s.dirName] as Gate | null);
  const fullVerifies = verifies.filter((g): g is Gate => Boolean(g) && g!.mode !== "container");
  const first = fullVerifies[0] ?? null;
  const lastWithAcceptance = [...fullVerifies].reverse().find((g) => g.acceptance) ?? null;

  const acceptanceStage = [...data.stages].reverse().find((s) => s.stageKey === "acceptance" && s.status === "succeeded");
  const suite = acceptanceStage ? (data.handoffs[acceptanceStage.dirName] as { coverage?: { kind: string }[] } | null) : null;
  const plan = data.stages.find((s) => s.stageKey === "testCases" && s.status === "succeeded");
  const planned = plan ? ((data.handoffs[plan.dirName] as { testCases?: unknown[] } | null)?.testCases?.length ?? 0) : 0;

  const review = data.stages.find((s) => s.stageKey === "review" && s.status === "succeeded");
  const findings = review ? ((data.handoffs[review.dirName] as { findings?: { severity: string }[] } | null)?.findings ?? []) : [];

  return {
    acceptance: lastWithAcceptance?.acceptance
      ? {
          failed: lastWithAcceptance.acceptance.failed,
          mode: lastWithAcceptance.acceptance.mode,
          passed: lastWithAcceptance.acceptance.passed,
          skipped: lastWithAcceptance.acceptance.skipped,
        }
      : null,
    acceptanceCoverage: suite?.coverage
      ? { covered: suite.coverage.filter((c) => c.kind !== "skipped").length, planned: planned || suite.coverage.length }
      : null,
    costUsd: round(data.run.costUsd),
    devCostUsd: round(sum(dev.map((s) => s.costUsd))),
    devMinutes: round(sum(dev.map(minutesOf)), 1),
    firstVerifyFailedSteps: first?.failedSteps ?? [],
    firstVerifyPassed: first ? Boolean(first.passed) : null,
    fixRounds: data.stages.filter((s) => /^Fix \d+/.test(s.label)).length,
    lessonsRecorded: data.lessonsRecorded,
    librarianCalls: data.librarianCalls,
    minutes: round(Math.max((Date.parse(data.run.updatedAt) - Date.parse(data.run.createdAt)) / 60_000, 0), 1),
    reviewBlocking: findings.filter((f) => f.severity === "blocker" || f.severity === "major").length,
    runId: data.run.id,
    status: data.run.status,
  };
}

export type BenchmarkSummary = {
  acceptancePassRate: number | null;
  deployed: number;
  firstVerifyPassRate: number | null;
  meanCostUsd: number;
  meanDevMinutes: number;
  meanMinutes: number;
  runs: number;
  totalCostUsd: number;
  totalFixRounds: number;
};

export function summarize(metrics: RunMetrics[]): BenchmarkSummary {
  const n = metrics.length || 1;
  const withVerify = metrics.filter((m) => m.firstVerifyPassed !== null);
  const ran = metrics.filter((m) => m.acceptance && !m.acceptance.skipped);
  const passed = sum(ran.map((m) => m.acceptance!.passed));
  const total = passed + sum(ran.map((m) => m.acceptance!.failed));
  return {
    acceptancePassRate: total ? round(passed / total, 3) : null,
    deployed: metrics.filter((m) => m.status === "deployed" || m.status === "deployed_partial").length,
    firstVerifyPassRate: withVerify.length ? round(withVerify.filter((m) => m.firstVerifyPassed).length / withVerify.length, 3) : null,
    meanCostUsd: round(sum(metrics.map((m) => m.costUsd)) / n),
    meanDevMinutes: round(sum(metrics.map((m) => m.devMinutes)) / n, 1),
    meanMinutes: round(sum(metrics.map((m) => m.minutes)) / n, 1),
    runs: metrics.length,
    totalCostUsd: round(sum(metrics.map((m) => m.costUsd))),
    totalFixRounds: sum(metrics.map((m) => m.fixRounds)),
  };
}

/**
 * The database file a reader outside the factory may open. While a factory
 * runs, the live WAL database must not be opened from another machine (Docker
 * vs the Mac): that can corrupt it. The factory's 10-minute snapshot is a
 * standalone copy that is safe to read.
 */
export function readableDatabase(dataDir: string): { path: string; snapshot: boolean } {
  if (factoryIsRunning(dataDir)) return { path: join(dataDir, BACKUP_DIR, SNAPSHOT_FILE), snapshot: true };
  return { path: join(dataDir, "factory.sqlite"), snapshot: false };
}

/** Reads one run without changing anything: SELECTs only, plus the run's stage folders. */
export async function loadRunData(dataDir: string, runId: string): Promise<RunData | null> {
  // Not { readonly }: SQLite can't open a WAL database read-only when its -shm file is missing.
  // Only SELECTs run here, and `create: false` never makes a new database.
  const db = new Database(readableDatabase(dataDir).path, { create: false, readwrite: true });
  try {
    const run = db
      .query<{ cost: number; created_at: string; id: string; status: string; updated_at: string }, [string]>(
        "SELECT id, status, cost_micro_usd / 1e6 AS cost, created_at, updated_at FROM runs WHERE id = ?",
      )
      .get(runId);
    if (!run) return null;
    const stages = db
      .query<{ cost: number; dir_name: string; finished_at: string | null; label: string; stage_key: string; started_at: string; status: string }, [string]>(
        "SELECT label, stage_key, status, cost_micro_usd / 1e6 AS cost, dir_name, started_at, finished_at FROM stages WHERE run_id = ? ORDER BY seq",
      )
      .all(runId);
    const count = (sql: string) => db.query<{ n: number }, [string]>(sql).get(runId)?.n ?? 0;
    const handoffs: Record<string, unknown> = {};
    for (const stage of stages) {
      handoffs[stage.dir_name] = await readFile(join(dataDir, "runs", runId, "stages", stage.dir_name, "handoff.json"), "utf8")
        .then((text) => JSON.parse(text) as unknown)
        .catch(() => null);
    }
    return {
      handoffs,
      lessonsRecorded: tableExists(db, "library_lessons") ? count("SELECT count(*) AS n FROM library_lessons WHERE last_run_id = ?") : 0,
      librarianCalls: tableExists(db, "library_queries") ? count("SELECT count(*) AS n FROM library_queries WHERE run_id = ? AND tool NOT LIKE 'auto:%' AND tool <> 'limit'") : 0,
      run: { costUsd: Number(run.cost ?? 0), createdAt: run.created_at, id: run.id, status: run.status, updatedAt: run.updated_at },
      stages: stages.map((s) => ({
        costUsd: Number(s.cost ?? 0),
        dirName: s.dir_name,
        finishedAt: s.finished_at,
        label: s.label,
        stageKey: s.stage_key,
        startedAt: s.started_at,
        status: s.status,
      })),
    };
  } finally {
    db.close();
  }
}

function tableExists(db: Database, name: string): boolean {
  return Boolean(db.query<{ n: number }, [string]>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.n);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(Number(value ?? 0) * f) / f;
}
