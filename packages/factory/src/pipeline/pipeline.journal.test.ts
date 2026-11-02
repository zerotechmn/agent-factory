import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StageRow } from "../runs/runs.store";
import { runPaths } from "./pipeline.artifacts";
import { Journal, loadJournal, type JournalEntry } from "./pipeline.journal";

const row = (seq: number, stageKey: StageRow["stageKey"], label: string, status: StageRow["status"], costUsd = 0.1): StageRow => ({
  costUsd,
  dirName: `${String(seq).padStart(2, "0")}-${stageKey}`,
  error: null,
  finishedAt: null,
  label,
  seq,
  stageKey,
  startedAt: "2026-11-03T00:00:00.000Z",
  status,
});

describe("loadJournal", () => {
  test("replays finished agent steps with their handoff and session, skipping verify and unfinished work", async () => {
    const paths = runPaths(mkdtempSync(join(tmpdir(), "journal-")), "journal001");
    const stages = [
      row(1, "research", "Research", "failed"),
      row(2, "requirements", "Requirements", "succeeded", 0.4),
      row(3, "development", "Development", "succeeded", 4),
      row(4, "verify", "Verify", "succeeded", 0),
      row(5, "review", "Review", "running"),
      row(6, "architecture", "Architecture", "succeeded"),
      { ...row(7, "uiDesign", "UI/UX design", "failed"), error: "Interrupted by restart" },
    ];
    for (const s of stages) mkdirSync(join(paths.stages, s.dirName), { recursive: true });
    writeFileSync(join(paths.stages, "02-requirements", "handoff.json"), JSON.stringify({ features: [] }));
    writeFileSync(join(paths.stages, "03-development", "handoff.json"), JSON.stringify({ commands: { test: "npm test" } }));
    writeFileSync(join(paths.stages, "03-development", "meta.json"), JSON.stringify({ sessionId: "sess-1" }));
    // 06-architecture "succeeded" but its handoff never got written: treat it as unfinished.

    const entries = await loadJournal(paths, stages);
    expect(entries.map((e) => [e.seq, e.stageKey, e.outcome])).toEqual([
      [1, "research", "failed"],
      [2, "requirements", "succeeded"],
      [3, "development", "succeeded"],
    ]);
    expect(entries[2]).toMatchObject({ costUsd: 4, handoff: { commands: { test: "npm test" } }, sessionId: "sess-1" });
    expect(entries[0]!.handoff).toBeNull();
  });
});

describe("Journal", () => {
  const entry = (seq: number, stageKey: JournalEntry["stageKey"], label: string): JournalEntry => ({
    costUsd: 0,
    handoff: { seq },
    label,
    outcome: "succeeded",
    seq,
    sessionId: null,
    stageKey,
  });

  test("hands out repeated stages in order, each once", () => {
    const journal = new Journal([entry(7, "review", "Review"), entry(9, "development", "Fix 1"), entry(11, "review", "Review (round-2)")]);
    expect(journal.take("review", "Review")?.seq).toBe(7);
    expect(journal.take("review", "Review")).toBeNull();
    expect(journal.take("review", "Review (round-2)")?.seq).toBe(11);
    expect(journal.take("development", "Development")).toBeNull();
    expect(journal.take("development", "Fix 1")?.seq).toBe(9);
  });
});
