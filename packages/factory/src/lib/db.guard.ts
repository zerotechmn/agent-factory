import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { config } from "./config";
import { db } from "./db";
import { BACKUP_DIR, SNAPSHOT_FILE } from "./db.lock";

// The factory's SQLite database runs in WAL mode, which coordinates readers
// and writers through a shared-memory file. That only works for processes on
// one machine: a factory in Docker and a process on the Mac (a second
// factory, a report script, the sqlite3 CLI) opening the same bind-mounted
// file can corrupt it. One run did end with "database disk image is
// malformed". So: one writing process per data folder, and everyone else
// reads a standalone snapshot.

const SNAPSHOT_MS = 10 * 60_000;
const BACKUPS_KEPT = 48;


/** A quick structural check at startup, so corruption is reported loudly instead of discovered mid-run. */
export function checkIntegrity(): { ok: boolean; problems: string[] } {
  const rows = db.query<{ quick_check: string }, []>("PRAGMA quick_check").all();
  const problems = rows.map((r) => r.quick_check).filter((r) => r !== "ok");
  return { ok: problems.length === 0, problems };
}

/**
 * Writes a consistent standalone copy (`VACUUM INTO`, no WAL) to
 * backups/latest.sqlite, safe for tools outside the factory to open, and
 * keeps one copy per hour for two days.
 */
export async function snapshot(dataDir = config.DATA_DIR, now = new Date()): Promise<string> {
  const dir = join(dataDir, BACKUP_DIR);
  await mkdir(dir, { recursive: true });
  const hour = now.toISOString().slice(0, 13).replace(/[-T:]/g, "");
  const tmp = join(dir, `.snapshot-${process.pid}.tmp`);
  await rm(tmp, { force: true });
  db.query("VACUUM INTO ?").run(tmp);
  // The hourly copy first (a hard copy of the temp file), then the temp file becomes latest: both appear atomically.
  const hourly = join(dir, `factory-${hour}.sqlite`);
  if (!existsSync(hourly)) await Bun.write(`${hourly}.tmp`, Bun.file(tmp)).then(() => rename(`${hourly}.tmp`, hourly));
  await rename(tmp, join(dir, SNAPSHOT_FILE));
  await prune(dir);
  return join(dir, SNAPSHOT_FILE);
}

/** Snapshots now and every 10 minutes. A failed snapshot is logged; it never stops the factory. */
export function startSnapshots(dataDir = config.DATA_DIR): void {
  const take = () =>
    snapshot(dataDir).catch((error: unknown) =>
      console.error("[db] snapshot failed", { message: error instanceof Error ? error.message : String(error) }),
    );
  void take();
  setInterval(take, SNAPSHOT_MS).unref();
}

async function prune(dir: string): Promise<void> {
  const hourly = (await readdir(dir)).filter((f) => /^factory-\d{10}\.sqlite$/.test(f)).sort();
  for (const old of hourly.slice(0, Math.max(hourly.length - BACKUPS_KEPT, 0))) await rm(join(dir, old), { force: true });
}
