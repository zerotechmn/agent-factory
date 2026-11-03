import { db } from "../lib/db";

// One row per answered (or stopped) chat message: enough to enforce the
// per-IP limit and count chat spend against the daily cap. Micro-dollars, as in runs.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_usage (
    run_id TEXT NOT NULL REFERENCES runs (id),
    ip TEXT NOT NULL,
    cost_micro_usd INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_usage_ip_created ON chat_usage (ip, created_at);
  CREATE INDEX IF NOT EXISTS chat_usage_created ON chat_usage (created_at);
`);

export function recordUsage({ costUsd, ip, runId }: { costUsd: number; ip: string; runId: string }): void {
  db.query("INSERT INTO chat_usage (run_id, ip, cost_micro_usd, created_at) VALUES (?, ?, ?, ?)").run(
    runId,
    ip,
    Math.round(costUsd * 1_000_000),
    new Date().toISOString(),
  );
}

export function countMessagesByIpSince(ip: string, sinceIso: string): number {
  return (
    db.query<{ n: number }, [string, string]>("SELECT count(*) AS n FROM chat_usage WHERE ip = ? AND created_at >= ?").get(ip, sinceIso)
      ?.n ?? 0
  );
}

export function spendSinceUsd(sinceIso: string): number {
  const micro =
    db.query<{ total: number | null }, [string]>("SELECT sum(cost_micro_usd) AS total FROM chat_usage WHERE created_at >= ?").get(sinceIso)
      ?.total ?? 0;
  return micro / 1_000_000;
}

export function deleteRun(runId: string): void {
  db.query("DELETE FROM chat_usage WHERE run_id = ?").run(runId);
}
