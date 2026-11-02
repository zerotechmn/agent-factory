import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { db } from "./db";
import { checkIntegrity, snapshot } from "./db.guard";
import { claimDataDir, factoryIsRunning } from "./db.lock";

describe("claimDataDir", () => {
  test("claims a free folder, and the lock shows the factory is running", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-"));
    expect(factoryIsRunning(dir)).toBe(false);
    const release = claimDataDir(dir);
    expect(factoryIsRunning(dir)).toBe(true);
    release();
  });

  test("refuses a folder another live factory holds", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-"));
    writeFileSync(join(dir, "factory.lock"), JSON.stringify({ heartbeatAt: new Date().toISOString(), host: "factory-container", pid: 1 }));
    expect(() => claimDataDir(dir)).toThrow("Another factory is using");
  });

  test("takes over a stale lock left by a factory that died", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-"));
    writeFileSync(join(dir, "factory.lock"), JSON.stringify({ heartbeatAt: new Date(Date.now() - 120_000).toISOString(), host: "old", pid: 1 }));
    const release = claimDataDir(dir);
    expect(factoryIsRunning(dir)).toBe(true);
    release();
  });
});

describe("snapshot", () => {
  test("writes a standalone copy outsiders can open, plus one hourly copy", async () => {
    db.exec("CREATE TABLE IF NOT EXISTS guard_probe (x INTEGER)");
    const dir = mkdtempSync(join(tmpdir(), "snap-"));
    const path = await snapshot(dir, new Date("2026-11-03T09:15:00Z"));
    await snapshot(dir, new Date("2026-11-03T09:45:00Z"));
    expect(readdirSync(join(dir, "backups")).sort()).toEqual(["factory-2026110309.sqlite", "latest.sqlite"]);
    const copy = new Database(path, { readonly: true });
    expect(copy.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode).not.toBe("wal");
    expect(copy.query<{ n: number }, []>("SELECT count(*) AS n FROM sqlite_master").get()!.n).toBeGreaterThan(0);
    copy.close();
    expect(existsSync(join(dir, "backups", `.snapshot-${process.pid}.tmp`))).toBe(false);
  });
});

describe("checkIntegrity", () => {
  test("passes on a healthy database", () => {
    expect(checkIntegrity()).toEqual({ ok: true, problems: [] });
  });
});
