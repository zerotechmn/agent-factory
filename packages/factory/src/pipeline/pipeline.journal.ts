import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { INTERRUPTED_ERROR, type StageRow } from "../runs/runs.store";
import type { RunPaths } from "./pipeline.artifacts";
import type { StageOutcome } from "./pipeline.stage-runner";
import { AGENT_STAGE_KEYS, type AgentStageKey } from "./pipeline.types";

// A run interrupted by a restart is resumed by running the same orchestration
// again, with every agent step that already finished answered from what it
// left on disk (handoff.json, meta.json) instead of being paid for twice.
// The orchestration is deterministic given its steps' results, so the replay
// walks the same path until it reaches the first unfinished step, which runs
// for real. Verify is never replayed: it is free, and the container it starts
// is part of the state the rest of the run relies on.

export type JournalEntry = {
  costUsd: number;
  handoff: unknown;
  label: string;
  outcome: StageOutcome;
  seq: number;
  sessionId: string | null;
  stageKey: AgentStageKey;
};

const REPLAYABLE: Partial<Record<StageRow["status"], StageOutcome>> = {
  failed: "failed",
  stopped_budget: "stopped_budget",
  succeeded: "succeeded",
};

/**
 * Finished agent steps in the order they ran. Steps a restart cut off are not
 * finished, whatever their status says, and a succeeded step without its
 * handoff is treated as unfinished too: both run again.
 */
export async function loadJournal(paths: RunPaths, stages: StageRow[]): Promise<JournalEntry[]> {
  const entries: JournalEntry[] = [];
  for (const stage of [...stages].sort((a, b) => a.seq - b.seq)) {
    const outcome = REPLAYABLE[stage.status];
    if (!outcome || stage.error === INTERRUPTED_ERROR || !(AGENT_STAGE_KEYS as readonly string[]).includes(stage.stageKey)) continue;
    const dir = join(paths.stages, stage.dirName);
    const handoff = outcome === "succeeded" ? await readJson(join(dir, "handoff.json")) : null;
    if (outcome === "succeeded" && handoff === undefined) continue;
    const meta = (await readJson(join(dir, "meta.json"))) as { sessionId?: unknown } | undefined;
    entries.push({
      costUsd: stage.costUsd,
      handoff: handoff ?? null,
      label: stage.label,
      outcome,
      seq: stage.seq,
      sessionId: typeof meta?.sessionId === "string" ? meta.sessionId : null,
      stageKey: stage.stageKey as AgentStageKey,
    });
  }
  return entries;
}

/**
 * Hands out journal entries in order. A step matches the first unused entry
 * with the same stage and label ("Fix 1", "Review (round-2)"), so repeated
 * stages replay in sequence. Once the live run asks for a step the journal
 * doesn't have, everything after it runs for real.
 */
export class Journal {
  private readonly used = new Set<number>();

  constructor(private readonly entries: JournalEntry[]) {}

  get size(): number {
    return this.entries.length;
  }

  take(stageKey: AgentStageKey, label: string): JournalEntry | null {
    const entry = this.entries.find((e) => !this.used.has(e.seq) && e.stageKey === stageKey && e.label === label);
    if (!entry) return null;
    this.used.add(entry.seq);
    return entry;
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}
