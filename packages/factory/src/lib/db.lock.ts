import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

// Who holds the factory's data folder. Kept apart from db.ts on purpose:
// tools outside the factory (the benchmark report) need to check the lock
// without opening the database, since opening it is what must be avoided.

export const LOCK_FILE = "factory.lock";
export const BACKUP_DIR = "backups";
export const SNAPSHOT_FILE = "latest.sqlite";

/** A lock not refreshed for this long belongs to a factory that is gone. */
const STALE_MS = 35_000;
const HEARTBEAT_MS = 10_000;

export type Lock = { heartbeatAt: string; host: string; pid: number };

/** True while a factory is running on this data folder; then only the snapshot may be opened from outside. */
export function factoryIsRunning(dataDir: string): boolean {
  const lock = readLock(join(dataDir, LOCK_FILE));
  return Boolean(lock && isFresh(lock));
}

export function readLock(path: string): Lock | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<Lock>;
    return typeof value.host === "string" && typeof value.pid === "number" && typeof value.heartbeatAt === "string" ? (value as Lock) : null;
  } catch {
    return null;
  }
}

export function isFresh(lock: Lock): boolean {
  return Date.now() - Date.parse(lock.heartbeatAt) < STALE_MS;
}

/**
 * Claims the data folder for this process, or throws when another live
 * factory holds it. The lock is refreshed every 10 s and removed on exit, so
 * a crashed factory's lock goes stale and the next start takes over.
 */
export function claimDataDir(dataDir: string): () => void {
  const path = join(dataDir, LOCK_FILE);
  const other = readLock(path);
  const me = { host: hostname(), pid: process.pid };
  if (other && isFresh(other) && !(other.host === me.host && other.pid === me.pid)) {
    throw new Error(
      `Another factory is using ${dataDir} (host ${other.host}, pid ${other.pid}, last seen ${other.heartbeatAt}). ` +
        "Two factories on one database corrupt it: stop the other one first (e.g. `docker compose stop factory`, or the local `bun src/server.ts`).",
    );
  }
  // Synchronous: the lock must exist before this process writes anything else.
  const beat = () => {
    try {
      writeFileSync(path, JSON.stringify({ ...me, heartbeatAt: new Date().toISOString() }));
    } catch (error) {
      console.error("[db] could not refresh the data folder lock", { message: error instanceof Error ? error.message : String(error) });
    }
  };
  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  timer.unref();
  const release = () => {
    clearInterval(timer);
    const current = readLock(path);
    if (current?.host === me.host && current.pid === me.pid) rmSync(path, { force: true });
  };
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      release();
      process.exit(0);
    });
  }
  return release;
}
