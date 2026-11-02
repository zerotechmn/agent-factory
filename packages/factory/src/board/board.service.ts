import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "../lib/config";
import { runPaths } from "../pipeline/pipeline.artifacts";
import type { GateResult } from "../pipeline/pipeline.gate";
import * as RunsStore from "../runs/runs.store";
import * as BoardStore from "./board.store";
import type { Board, BoardCard } from "./board.types";
import {
  featureColumnFromTests,
  parseTestLog,
  seedsFromPrd,
  seedsFromTestPlan,
  testColumnAfterVerify,
  testIdsIn,
  testKey,
} from "./board.utils";

const EVENT_LIMIT = 300;

type Stamp = { actor: string; at?: string };

/**
 * The run's task board. Cards come from the plan (PRD features and screens,
 * test plan cases and smoke checks); the developer moves them while it works,
 * and the verify gate settles them from real results. Runs that finished
 * before the board existed are rebuilt once from their stage folders.
 */
export async function getBoard(runId: string): Promise<Board> {
  if (!BoardStore.hasCards(runId)) await backfill(runId);
  return { cards: BoardStore.listCards(runId), events: BoardStore.listEvents(runId, EVENT_LIMIT) };
}

export function onRequirements(runId: string, prd: unknown, { actor, at = now() }: Stamp): void {
  BoardStore.seedCards(runId, seedsFromPrd(prd), { actor, at });
}

export function onTestPlan(runId: string, plan: unknown, prd: unknown, { actor, at = now() }: Stamp): void {
  BoardStore.seedCards(runId, seedsFromTestPlan(plan, prd), { actor, at });
}

/**
 * Watches the developer's file writes: a test case id appearing in written
 * code means that test is being written (or, after a failed verify, fixed).
 * Free and immediate, and it works without the agent's cooperation.
 */
export function developerObserver(runId: string, { actor, at }: Stamp): (message: SDKMessage) => void {
  const seen = new Set<string>();
  return (message) => {
    if (message.type !== "assistant") return;
    const ids = message.message.content.flatMap((block) =>
      block.type === "tool_use" ? testIdsIn(writtenText(block.name, block.input)) : [],
    );
    const fresh = ids.filter((id) => !seen.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seen.add(id));

    const cards = BoardStore.listCards(runId);
    const tests = testCardsByKey(cards);
    const stamp = { actor, at: at ?? now() };
    for (const id of fresh) {
      const card = tests.get(id);
      if (!card || (card.column !== "todo" && card.column !== "failed")) continue;
      BoardStore.moveCard(runId, card.id, "doing", {
        ...stamp,
        note: card.column === "failed" ? "Being fixed" : "Test being written",
      });
      for (const featureId of card.links) {
        const feature = cards.find((c) => c.id === featureId);
        if (feature?.column === "todo") BoardStore.moveCard(runId, featureId, "doing", { ...stamp, note: "Work started" });
      }
    }
  };
}

/** The developer's own updates (update_tasks tool). It may only claim work, never verify it. */
export function applyDeveloperUpdate(
  runId: string,
  updates: { id: string; note?: string; status: "doing" | "built" }[],
  { actor }: Stamp,
): { moved: string[]; unknown: string[] } {
  const cards = new Map(BoardStore.listCards(runId).map((c) => [c.id.toUpperCase(), c]));
  const moved: string[] = [];
  const unknown: string[] = [];
  for (const update of updates) {
    const card = cards.get(update.id.trim().toUpperCase()) ?? cards.get(testKey(update.id));
    if (!card) {
      unknown.push(update.id);
      continue;
    }
    if (BoardStore.moveCard(runId, card.id, update.status, { actor, at: now(), note: update.note ?? card.note })) moved.push(card.id);
  }
  return { moved, unknown };
}

export function onDevelopmentDone(
  runId: string,
  handoff: unknown,
  { actor, at = now() }: Stamp,
): void {
  const dev = (handoff ?? {}) as {
    knownGaps?: string[];
    screens?: { path: string | null; screenId: string }[];
    testsWritten?: string[];
  };
  const cards = BoardStore.listCards(runId);
  const stamp = { actor, at };
  const claimable = (c: BoardCard) => c.column === "todo" || c.column === "doing";

  const written = new Set((dev.testsWritten ?? []).map(testKey));
  for (const card of cards.filter((c) => c.kind === "test")) {
    if (written.has(testKey(card.id))) {
      if (claimable(card)) BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: "Automated test written" });
    } else if (card.column === "todo") {
      BoardStore.moveCard(runId, card.id, "todo", { ...stamp, note: "Not covered by an automated test yet" });
    }
  }

  const screens = new Map((dev.screens ?? []).map((s) => [s.screenId, s]));
  for (const card of cards.filter((c) => c.kind === "screen" && claimable(c))) {
    const screen = screens.get(card.id);
    if (!screen) continue;
    BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: screen.path ? `Opens at ${screen.path}` : "Not reachable by URL" });
  }

  for (const card of cards.filter((c) => c.kind === "feature" && claimable(c))) {
    const gap = (dev.knownGaps ?? []).find((g) => g.includes(card.id));
    if (gap) BoardStore.moveCard(runId, card.id, card.column, { ...stamp, note: `Known gap: ${gap}` });
    else BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: "Implemented" });
  }
}

export function onVerify(
  runId: string,
  { gate, testLog, testsWritten }: { gate: GateResult; testLog: string; testsWritten: string[] },
  { actor, at = now() }: Stamp,
): void {
  const stamp = { actor, at };
  let cards = BoardStore.listCards(runId);

  if (gate.mode === "full" && gate.tests) {
    const results = parseTestLog(testLog);
    const written = new Set([...testsWritten.map(testKey), ...results.keys()]);
    for (const card of cards.filter((c) => c.kind === "test")) {
      const key = testKey(card.id);
      const next = testColumnAfterVerify({ card, logResult: results.get(key), suitePassed: gate.tests.ok, written: written.has(key) });
      if (next) BoardStore.moveCard(runId, card.id, next.column, { ...stamp, note: next.note });
    }
  }

  const smoke = new Map(gate.smoke.map((s) => [s.id, s]));
  for (const card of cards.filter((c) => c.kind === "smoke")) {
    const result = smoke.get(card.id);
    if (!gate.containerOk) {
      BoardStore.moveCard(runId, card.id, card.column, { ...stamp, note: "Not checked: the app container didn't start" });
    } else if (result) {
      BoardStore.moveCard(runId, card.id, result.ok ? "verified" : "failed", {
        ...stamp,
        note: `${result.path} returned ${result.actualStatus ?? "no response"} (expected ${result.expectStatus})`,
      });
    }
  }

  if (gate.ui && !gate.ui.skipped) {
    for (const card of cards.filter((c) => c.kind === "screen")) {
      const pages = gate.ui.pages.filter((p) => p.screenId === card.id);
      if (!pages.length) continue;
      const failing = pages.find((p) => p.failures.length);
      BoardStore.moveCard(runId, card.id, failing ? "failed" : "verified", {
        ...stamp,
        note: failing
          ? `${failing.viewport}: ${failing.failures[0]?.detail ?? "browser check failed"}`
          : `Browser check clean at ${pages.map((p) => p.viewport).join(" and ")}`,
      });
    }
  }

  // Features last, from the test results just recorded.
  cards = BoardStore.listCards(runId);
  for (const feature of cards.filter((c) => c.kind === "feature")) {
    const tests = cards.filter((c) => c.kind === "test" && c.links.includes(feature.id));
    const column = featureColumnFromTests(tests);
    if (!column) continue;
    const failing = tests.filter((t) => t.column === "failed").map((t) => t.id);
    BoardStore.moveCard(runId, feature.id, column, {
      ...stamp,
      note: column === "failed" ? `Failing: ${failing.join(", ")}` : `All ${tests.length} tests pass`,
    });
  }
}

/** Board updates are reporting only: a bug here must never fail a build. */
export function safely(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .catch((error: unknown) => console.error("[board] update failed", { label, message: error instanceof Error ? error.message : String(error) }));
}

/** Replays a finished run's stage folders through the same handlers the live pipeline uses. */
async function backfill(runId: string): Promise<void> {
  const run = RunsStore.getRun(runId);
  if (!run || run.status === "queued" || run.status === "running") return;
  const paths = runPaths(config.DATA_DIR, runId);
  const read = async (dirName: string, file: string) => readFile(join(paths.stages, dirName, file), "utf8").catch(() => null);
  const json = async (dirName: string) => {
    const text = await read(dirName, "handoff.json");
    return text ? (JSON.parse(text) as unknown) : null;
  };

  let prd: unknown = null;
  let testsWritten: string[] = [];
  for (const stage of RunsStore.listStages(runId)) {
    const finished = { actor: stage.label, at: stage.finishedAt ?? stage.startedAt };
    if (stage.stageKey === "requirements" && stage.status === "succeeded") {
      prd = await json(stage.dirName);
      onRequirements(runId, prd, finished);
    } else if (stage.stageKey === "testCases" && stage.status === "succeeded") {
      onTestPlan(runId, await json(stage.dirName), prd, finished);
    } else if (stage.stageKey === "development") {
      const observe = developerObserver(runId, { actor: stage.label, at: stage.startedAt });
      for (const line of ((await read(stage.dirName, "transcript.jsonl")) ?? "").split("\n")) {
        if (line.includes('"tool_use"')) observe(JSON.parse(line) as SDKMessage);
      }
      if (stage.status !== "succeeded") continue;
      const handoff = await json(stage.dirName);
      testsWritten = ((handoff as { testsWritten?: string[] } | null)?.testsWritten ?? testsWritten);
      onDevelopmentDone(runId, handoff, finished);
    } else if (stage.stageKey === "verify") {
      const gate = (await json(stage.dirName)) as GateResult | null;
      if (!gate) continue;
      onVerify(runId, { gate, testLog: (await read(stage.dirName, "tests.log")) ?? "", testsWritten }, finished);
    }
  }
  console.info("[board] rebuilt from stage folders", { cards: BoardStore.listCards(runId).length, runId });
}

function testCardsByKey(cards: BoardCard[]): Map<string, BoardCard> {
  return new Map(cards.filter((c) => c.kind === "test").map((c) => [testKey(c.id), c]));
}

/** The text a file-writing tool call puts into the workspace. */
function writtenText(tool: string, input: unknown): string {
  const i = (input ?? {}) as { content?: string; edits?: { new_string?: string }[]; new_string?: string };
  if (tool === "Write") return i.content ?? "";
  if (tool === "Edit") return i.new_string ?? "";
  if (tool === "MultiEdit") return (i.edits ?? []).map((e) => e.new_string ?? "").join("\n");
  return "";
}

function now(): string {
  return new Date().toISOString();
}

