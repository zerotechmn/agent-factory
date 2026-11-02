import { db } from "../lib/db";
import { DEFAULT_DESIGN_SYSTEM, type DesignSystem, type RunStatus, type StageKey, type StageStatus } from "../pipeline/pipeline.types";

export type RunRow = {
  appUrl: string | null;
  budgetUsd: number;
  costUsd: number;
  createdAt: string;
  currentStage: string | null;
  designSystem: DesignSystem;
  id: string;
  /** False for runs nobody watches (benchmark, API scripts): they never pause for the customer. */
  interactive: boolean;
  prompt: string;
  status: RunStatus;
  stopReason: string | null;
  updatedAt: string;
};

export type StageRow = {
  costUsd: number;
  dirName: string;
  error: string | null;
  finishedAt: string | null;
  label: string;
  seq: number;
  stageKey: StageKey;
  startedAt: string;
  status: StageStatus;
};

// Money is stored as integer micro-dollars: SQLite has no decimal type and
// float columns drift when summed.
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    ip TEXT NOT NULL,
    status TEXT NOT NULL,
    current_stage TEXT,
    cost_micro_usd INTEGER NOT NULL DEFAULT 0,
    budget_micro_usd INTEGER NOT NULL,
    app_url TEXT,
    stop_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS runs_ip_created ON runs (ip, created_at);
  CREATE INDEX IF NOT EXISTS runs_status ON runs (status, created_at);
  CREATE TABLE IF NOT EXISTS stages (
    run_id TEXT NOT NULL REFERENCES runs (id),
    seq INTEGER NOT NULL,
    stage_key TEXT NOT NULL,
    label TEXT NOT NULL,
    dir_name TEXT NOT NULL,
    status TEXT NOT NULL,
    cost_micro_usd INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    PRIMARY KEY (run_id, seq)
  );
`);

// Columns added after the first release; ALTER is idempotent via the check.
const runColumns = new Set(db.query<{ name: string }, []>("PRAGMA table_info(runs)").all().map((c) => c.name));
if (!runColumns.has("resume_count")) {
  // How many times a restart interrupted this run and it was put back in the queue.
  db.exec("ALTER TABLE runs ADD COLUMN resume_count INTEGER NOT NULL DEFAULT 0");
}
if (!runColumns.has("design_system")) {
  db.exec(`ALTER TABLE runs ADD COLUMN design_system TEXT NOT NULL DEFAULT '${DEFAULT_DESIGN_SYSTEM}'`);
  // Runs from before design systems existed all used the custom-design path.
  db.exec(`UPDATE runs SET design_system = 'custom'`);
}
if (!runColumns.has("interactive")) {
  db.exec("ALTER TABLE runs ADD COLUMN interactive INTEGER NOT NULL DEFAULT 1");
}

const now = () => new Date().toISOString();
const toMicro = (usd: number) => Math.round(Math.max(Number(usd ?? 0), 0) * 1_000_000);
const fromMicro = (micro: number) => Number(micro ?? 0) / 1_000_000;

type RawRun = {
  app_url: string | null;
  budget_micro_usd: number;
  cost_micro_usd: number;
  created_at: string;
  current_stage: string | null;
  design_system: DesignSystem;
  id: string;
  interactive: number;
  prompt: string;
  status: RunStatus;
  stop_reason: string | null;
  updated_at: string;
};

function mapRun(row: RawRun): RunRow {
  return {
    appUrl: row.app_url,
    budgetUsd: fromMicro(row.budget_micro_usd),
    costUsd: fromMicro(row.cost_micro_usd),
    createdAt: row.created_at,
    currentStage: row.current_stage,
    designSystem: row.design_system,
    id: row.id,
    interactive: row.interactive !== 0,
    prompt: row.prompt,
    status: row.status,
    stopReason: row.stop_reason,
    updatedAt: row.updated_at,
  };
}

export function insertRun({
  budgetUsd,
  designSystem,
  id,
  interactive,
  ip,
  prompt,
}: {
  budgetUsd: number;
  designSystem: DesignSystem;
  id: string;
  interactive: boolean;
  ip: string;
  prompt: string;
}) {
  const ts = now();
  db.query(
    `INSERT INTO runs (id, prompt, ip, status, budget_micro_usd, design_system, interactive, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
  ).run(id, prompt, ip, toMicro(budgetUsd), designSystem, interactive ? 1 : 0, ts, ts);
}

export function getRun(id: string): RunRow | null {
  const row = db.query<RawRun, [string]>("SELECT * FROM runs WHERE id = ?").get(id);
  return row ? mapRun(row) : null;
}

export function listStages(runId: string): StageRow[] {
  return db
    .query<
      {
        cost_micro_usd: number;
        dir_name: string;
        error: string | null;
        finished_at: string | null;
        label: string;
        seq: number;
        stage_key: StageKey;
        started_at: string;
        status: StageStatus;
      },
      [string]
    >("SELECT * FROM stages WHERE run_id = ? ORDER BY seq")
    .all(runId)
    .map((row) => ({
      costUsd: fromMicro(row.cost_micro_usd),
      dirName: row.dir_name,
      error: row.error,
      finishedAt: row.finished_at,
      label: row.label,
      seq: row.seq,
      stageKey: row.stage_key,
      startedAt: row.started_at,
      status: row.status,
    }));
}

export function updateRun(
  id: string,
  patch: Partial<Pick<RunRow, "appUrl" | "budgetUsd" | "costUsd" | "currentStage" | "status" | "stopReason">>,
) {
  const current = getRun(id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.query(
    `UPDATE runs SET status = ?, current_stage = ?, cost_micro_usd = ?, budget_micro_usd = ?, app_url = ?, stop_reason = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.status, next.currentStage, toMicro(next.costUsd), toMicro(next.budgetUsd), next.appUrl, next.stopReason, now(), id);
}

export function startStage(runId: string, stage: Pick<StageRow, "dirName" | "label" | "seq" | "stageKey">) {
  db.query(
    `INSERT INTO stages (run_id, seq, stage_key, label, dir_name, status, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', ?)`,
  ).run(runId, stage.seq, stage.stageKey, stage.label, stage.dirName, now());
}

export function finishStage(
  runId: string,
  seq: number,
  { costUsd, error, status }: { costUsd: number; error: string | null; status: StageStatus },
) {
  db.query(
    `UPDATE stages SET status = ?, cost_micro_usd = ?, error = ?, finished_at = ? WHERE run_id = ? AND seq = ?`,
  ).run(status, toMicro(costUsd), error, now(), runId, seq);
}

export function claimNextQueuedRun(): RunRow | null {
  // Single process owns the queue, so a plain select-then-update is race-free here.
  const row = db.query<RawRun, []>("SELECT * FROM runs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();
  if (!row) return null;
  updateRun(row.id, { status: "running" });
  return getRun(row.id);
}

export function countRunning(): number {
  // A run waiting for the customer still holds its slot: it resumes without re-queueing.
  return db.query<{ n: number }, []>("SELECT count(*) AS n FROM runs WHERE status IN ('running', 'waiting_customer')").get()?.n ?? 0;
}

export function countRunsByIpSince(ip: string, sinceIso: string): number {
  return (
    db.query<{ n: number }, [string, string]>("SELECT count(*) AS n FROM runs WHERE ip = ? AND created_at >= ?").get(
      ip,
      sinceIso,
    )?.n ?? 0
  );
}

export function spendSinceUsd(sinceIso: string): number {
  const micro =
    db
      .query<{ total: number | null }, [string]>("SELECT sum(cost_micro_usd) AS total FROM runs WHERE created_at >= ?")
      .get(sinceIso)?.total ?? 0;
  return fromMicro(micro);
}

/** A restart kills in-flight agents; mark those runs failed instead of leaving them "running" forever. */
/** The error a restart writes on the steps it cut off; a resumed run runs those steps again. */
export const INTERRUPTED_ERROR = "Interrupted by restart";

/**
 * After a restart, runs that were in progress go back to the front of the
 * queue (oldest first) and resume from their finished steps. A run the
 * factory keeps dying on is failed after `maxResumes` tries instead of
 * looping. Runs in `exclude` (feedback rounds) are left for their own handling.
 */
export function requeueInterruptedRuns({ exclude, maxResumes }: { exclude: string[]; maxResumes: number }): {
  failed: string[];
  requeued: string[];
} {
  const at = now();
  const failed: string[] = [];
  const requeued: string[] = [];
  db.transaction(() => {
    db.query(`UPDATE stages SET status = 'failed', error = ?, finished_at = ? WHERE status = 'running'`).run(INTERRUPTED_ERROR, at);
    const rows = db
      .query<{ id: string; resume_count: number }, []>("SELECT id, resume_count FROM runs WHERE status IN ('running', 'waiting_customer')")
      .all()
      .filter((r) => !exclude.includes(r.id));
    for (const row of rows) {
      if (row.resume_count >= maxResumes) {
        db.query(`UPDATE runs SET status = 'failed', current_stage = NULL, stop_reason = ?, updated_at = ? WHERE id = ?`).run(
          `The factory restarted ${row.resume_count + 1} times during this run; giving up instead of retrying again`,
          at,
          row.id,
        );
        failed.push(row.id);
        continue;
      }
      db.query(
        `UPDATE runs SET status = 'queued', current_stage = NULL, stop_reason = 'Resuming after a factory restart', resume_count = resume_count + 1, updated_at = ? WHERE id = ?`,
      ).run(at, row.id);
      requeued.push(row.id);
    }
  })();
  return { failed, requeued };
}

export function queuePosition(id: string): number {
  return (
    db
      .query<{ n: number }, [string]>(
        `SELECT count(*) AS n FROM runs WHERE status = 'queued' AND created_at <= (SELECT created_at FROM runs WHERE id = ?)`,
      )
      .get(id)?.n ?? 0
  );
}

/** Part of deleting a run; the caller wraps every store's deleteRun in one transaction. */
export function deleteRun(runId: string): void {
  db.query("DELETE FROM stages WHERE run_id = ?").run(runId);
  db.query("DELETE FROM runs WHERE id = ?").run(runId);
}
