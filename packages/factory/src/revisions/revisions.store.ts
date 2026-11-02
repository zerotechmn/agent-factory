import { db } from "../lib/db";

export type RevisionStatus = "queued" | "running" | "deployed" | "failed";

export type Revision = {
  costUsd: number;
  createdAt: string;
  feedback: string;
  finishedAt: string | null;
  n: number;
  /** Why it failed, or what shipped with known issues. */
  note: string | null;
  status: RevisionStatus;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS run_revisions (
    run_id TEXT NOT NULL REFERENCES runs (id),
    n INTEGER NOT NULL,
    feedback TEXT NOT NULL,
    status TEXT NOT NULL,
    cost_micro_usd INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    PRIMARY KEY (run_id, n)
  );
`);

type Raw = { cost_micro_usd: number; created_at: string; feedback: string; finished_at: string | null; n: number; note: string | null; status: RevisionStatus };

/** Revision numbers start at 2: the original build is revision 1. */
export function addRevision(runId: string, feedback: string): number {
  const last = db.query<{ n: number | null }, [string]>("SELECT max(n) AS n FROM run_revisions WHERE run_id = ?").get(runId)?.n ?? 1;
  const n = last + 1;
  db.query("INSERT INTO run_revisions (run_id, n, feedback, status, created_at) VALUES (?, ?, ?, 'queued', ?)").run(runId, n, feedback, new Date().toISOString());
  return n;
}

export function listRevisions(runId: string): Revision[] {
  return db.query<Raw, [string]>("SELECT * FROM run_revisions WHERE run_id = ? ORDER BY n").all(runId).map(map);
}

export function pendingRevision(runId: string): Revision | null {
  const row = db.query<Raw, [string]>("SELECT * FROM run_revisions WHERE run_id = ? AND status = 'queued' ORDER BY n LIMIT 1").get(runId);
  return row ? map(row) : null;
}

export function updateRevision(runId: string, n: number, patch: { costUsd?: number; note?: string | null; status: RevisionStatus }): void {
  const done = patch.status === "deployed" || patch.status === "failed";
  db.query(
    `UPDATE run_revisions SET status = ?, cost_micro_usd = coalesce(?, cost_micro_usd), note = coalesce(?, note), finished_at = CASE WHEN ? THEN ? ELSE finished_at END
     WHERE run_id = ? AND n = ?`,
  ).run(
    patch.status,
    patch.costUsd === undefined ? null : Math.round(Math.max(patch.costUsd, 0) * 1_000_000),
    patch.note ?? null,
    done ? 1 : 0,
    new Date().toISOString(),
    runId,
    n,
  );
}

export function runningRevisionRuns(): string[] {
  return db.query<{ run_id: string }, []>("SELECT DISTINCT run_id FROM run_revisions WHERE status = 'running'").all().map((r) => r.run_id);
}

/** A restart kills a revision in progress like any run. */
export function failInterruptedRevisions(): void {
  db.query("UPDATE run_revisions SET status = 'failed', note = 'Factory restarted while this revision was in progress' WHERE status = 'running'").run();
}

function map(row: Raw): Revision {
  return {
    costUsd: Number(row.cost_micro_usd ?? 0) / 1_000_000,
    createdAt: row.created_at,
    feedback: row.feedback,
    finishedAt: row.finished_at,
    n: row.n,
    note: row.note,
    status: row.status,
  };
}
