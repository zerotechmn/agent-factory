import { db } from "../lib/db";
import type { Answer, Checkpoint, CheckpointState, PrdCheckpointContext, Question } from "./questions.types";

db.exec(`
  CREATE TABLE IF NOT EXISTS customer_checkpoints (
    run_id TEXT NOT NULL REFERENCES runs (id),
    checkpoint TEXT NOT NULL,
    items TEXT NOT NULL,
    context TEXT,
    deadline TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    closed_by TEXT,
    answers TEXT,
    feedback TEXT,
    PRIMARY KEY (run_id, checkpoint)
  );
`);

type Raw = {
  answers: string | null;
  checkpoint: Checkpoint;
  closed_at: string | null;
  closed_by: "customer" | "timeout" | null;
  context: string | null;
  deadline: string;
  feedback: string | null;
  items: string;
  opened_at: string;
};

export function openCheckpoint(
  runId: string,
  { checkpoint, context, deadline, items, openedAt }: { checkpoint: Checkpoint; context: PrdCheckpointContext | null; deadline: string; items: Question[]; openedAt: string },
): void {
  db.query(
    `INSERT OR REPLACE INTO customer_checkpoints (run_id, checkpoint, items, context, deadline, opened_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(runId, checkpoint, JSON.stringify(items), context ? JSON.stringify(context) : null, deadline, openedAt);
}

/** Closes an open checkpoint; returns false when it was already closed (first answer wins). */
export function closeCheckpoint(
  runId: string,
  checkpoint: Checkpoint,
  { answers, at, closedBy, feedback }: { answers: Answer[]; at: string; closedBy: "customer" | "timeout"; feedback: string | null },
): boolean {
  const result = db
    .query(
      `UPDATE customer_checkpoints SET closed_at = ?, closed_by = ?, answers = ?, feedback = ?
       WHERE run_id = ? AND checkpoint = ? AND closed_at IS NULL`,
    )
    .run(at, closedBy, JSON.stringify(answers), feedback, runId, checkpoint);
  return result.changes > 0;
}

export function getCheckpoint(runId: string, checkpoint: Checkpoint): CheckpointState | null {
  const row = db.query<Raw, [string, string]>("SELECT * FROM customer_checkpoints WHERE run_id = ? AND checkpoint = ?").get(runId, checkpoint);
  return row ? map(row) : null;
}

export function openCheckpointOf(runId: string): CheckpointState | null {
  const row = db.query<Raw, [string]>("SELECT * FROM customer_checkpoints WHERE run_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1").get(runId);
  return row ? map(row) : null;
}

export function listCheckpoints(runId: string): CheckpointState[] {
  return db.query<Raw, [string]>("SELECT * FROM customer_checkpoints WHERE run_id = ? ORDER BY opened_at").all(runId).map(map);
}

function map(row: Raw): CheckpointState {
  return {
    answers: row.answers ? (JSON.parse(row.answers) as Answer[]) : null,
    checkpoint: row.checkpoint,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    context: row.context ? (JSON.parse(row.context) as PrdCheckpointContext) : null,
    deadline: row.deadline,
    feedback: row.feedback,
    items: JSON.parse(row.items) as Question[],
    openedAt: row.opened_at,
  };
}

/** Part of deleting a run; the caller wraps every store's deleteRun in one transaction. */
export function deleteRun(runId: string): void {
  db.query("DELETE FROM customer_checkpoints WHERE run_id = ?").run(runId);
}
