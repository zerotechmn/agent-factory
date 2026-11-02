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
  featureColumnWhileBuilding,
  parseTestCounts,
  parseTestLog,
  seedsFromPrd,
  seedsFromTestPlan,
  testColumnAfterVerify,
  testIdsIn,
  testKey,
  toolResultText,
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
 * Watches the developer's work without asking anything of it (no tool, no
 * prompt tokens): a test case id in written code means that test is being
 * written or fixed, and the developer's own test runs show which cases pass
 * locally. Features follow their tests. Only verify marks anything verified.
 */
export function developerObserver(runId: string, { actor, at }: Stamp): (message: SDKMessage) => void {
  const touched = new Set<string>();
  const bashCalls = new Set<string>();
  return (message) => {
    const stamp = { actor, at: at ?? now() };
    if (message.type === "assistant") {
      const ids: string[] = [];
      for (const block of message.message.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "Bash") bashCalls.add(block.id);
        ids.push(...testIdsIn(writtenText(block.name, block.input)));
      }
      const fresh = ids.filter((id) => !touched.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => touched.add(id));
      const tests = testCardsByKey(BoardStore.listCards(runId));
      for (const id of fresh) {
        const card = tests.get(id);
        if (!card || (card.column !== "todo" && card.column !== "failed")) continue;
        BoardStore.moveCard(runId, card.id, "doing", { ...stamp, note: card.column === "failed" ? "Being fixed" : "Test being written" });
      }
      syncFeatures(runId, stamp);
      return;
    }

    if (message.type !== "user" || !Array.isArray(message.message.content)) return;
    for (const block of message.message.content) {
      if (block.type !== "tool_result" || !bashCalls.has(block.tool_use_id)) continue;
      const output = toolResultText(block.content);
      const results = parseTestLog(output);
      const counts = parseTestCounts(output);
      // A fully green run proves every test written so far passes, even when the output lists no names.
      if (counts && counts.failed === 0 && counts.passed > 0) {
        for (const id of touched) if (!results.has(id)) results.set(id, "passed");
      }
      if (!results.size) continue;
      const tests = testCardsByKey(BoardStore.listCards(runId));
      for (const [id, outcome] of results) {
        const card = tests.get(id);
        if (!card) continue;
        if (outcome === "passed" && card.column !== "built" && card.column !== "verified") {
          BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: "Passing in the developer's test run" });
        }
        if (outcome === "failed") BoardStore.moveCard(runId, card.id, "doing", { ...stamp, note: "Failing in the developer's test run" });
      }
      syncFeatures(runId, stamp);
    }
  };
}

/** While building, a feature is as far along as its tests; verify settles it later. */
function syncFeatures(runId: string, stamp: { actor: string; at: string }): void {
  const cards = BoardStore.listCards(runId);
  for (const feature of cards.filter((c) => c.kind === "feature")) {
    const tests = cards.filter((c) => c.kind === "test" && c.links.includes(feature.id));
    const next = featureColumnWhileBuilding(tests);
    if (!next || next === feature.column) continue;
    // Building never undoes a verification; only a failing local test reopens it.
    if (feature.column === "verified" && next === "built") continue;
    const passing = tests.filter((t) => t.column === "built" || t.column === "verified").length;
    BoardStore.moveCard(runId, feature.id, next, { ...stamp, note: `${passing} of ${tests.length} tests passing locally` });
  }
}

/**
 * Which features a development handoff speaks for. Undefined: all of them (a
 * single development session, or the merged result of all parts). A list: one
 * feature group's session, which moves only its own features and their tests.
 * "none": the scaffold and finish sessions, which own no feature.
 */
export type DevelopmentScope = string[] | "none" | undefined;

export function onDevelopmentDone(
  runId: string,
  handoff: unknown,
  { actor, at = now() }: Stamp,
  scope: DevelopmentScope = undefined,
): void {
  const dev = (handoff ?? {}) as {
    knownGaps?: string[];
    screens?: { path: string | null; screenId: string }[];
    testsWritten?: string[];
  };
  const cards = BoardStore.listCards(runId);
  const stamp = { actor, at };
  const claimable = (c: BoardCard) => c.column === "todo" || c.column === "doing";

  const inScope = (card: BoardCard) => !Array.isArray(scope) || card.links.some((id) => scope.includes(id)) || scope.includes(card.id);
  const written = new Set((dev.testsWritten ?? []).map(testKey));
  for (const card of cards.filter((c) => c.kind === "test" && inScope(c))) {
    if (written.has(testKey(card.id))) {
      if (claimable(card)) BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: "Automated test written" });
    } else if (card.column === "todo" && scope === undefined) {
      BoardStore.moveCard(runId, card.id, "todo", { ...stamp, note: "Not covered by an automated test yet" });
    }
  }

  const screens = new Map((dev.screens ?? []).map((s) => [s.screenId, s]));
  for (const card of cards.filter((c) => c.kind === "screen" && claimable(c))) {
    const screen = screens.get(card.id);
    if (!screen) continue;
    BoardStore.moveCard(runId, card.id, "built", { ...stamp, note: screen.path ? `Opens at ${screen.path}` : "Not reachable by URL" });
  }

  if (scope === "none") return;
  for (const card of cards.filter((c) => c.kind === "feature" && claimable(c) && inScope(c))) {
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
      // The independent tester's result outranks the developer's own test for the same case.
      const independent = gate.acceptance?.perCase[key];
      if (independent) {
        const advisory = gate.acceptance?.mode === "advisory" && independent === "failed" ? " (advisory)" : "";
        BoardStore.moveCard(runId, card.id, independent === "passed" ? "verified" : "failed", {
          ...stamp,
          note: `Independent acceptance test ${independent}${advisory}`,
        });
        continue;
      }
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

/**
 * A feedback round changed the spec: changed features and screens, and the
 * tests linked to them, go back to To do; removed ones say so. New items are
 * seeded by onRequirements / onTestPlan as their stages finish.
 */
export function onRevision(runId: string, diff: { added: string[]; changed: string[]; removed: string[] }, { actor, at = now() }: Stamp): void {
  const cards = BoardStore.listCards(runId);
  const changed = new Set(diff.changed);
  for (const card of cards) {
    if (changed.has(card.id) || (card.kind === "test" && card.links.some((id) => changed.has(id)))) {
      BoardStore.moveCard(runId, card.id, "todo", { actor, at, note: `Changed by ${actor.toLowerCase()}` });
    }
    if (diff.removed.includes(card.id)) BoardStore.moveCard(runId, card.id, card.column, { actor, at, note: `Removed by ${actor.toLowerCase()}` });
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
  if (!run || run.status === "queued" || run.status === "running" || run.status === "waiting_customer") return;
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
        if (line.includes('"tool_use"') || line.includes('"tool_result"')) observe(JSON.parse(line) as SDKMessage);
      }
      if (stage.status !== "succeeded") continue;
      const handoff = await json(stage.dirName);
      // Built in parts, each part adds its own tests; a single session reports them all.
      testsWritten = [...new Set([...testsWritten, ...((handoff as { testsWritten?: string[] } | null)?.testsWritten ?? [])])];
      onDevelopmentDone(runId, handoff, finished, scopeFromLabel(stage.label));
    } else if (stage.stageKey === "verify") {
      const gate = (await json(stage.dirName)) as GateResult | null;
      if (!gate) continue;
      onVerify(runId, { gate, testLog: (await read(stage.dirName, "tests.log")) ?? "", testsWritten }, finished);
    }
  }
  console.info("[board] rebuilt from stage folders", { cards: BoardStore.listCards(runId).length, runId });
}

/** "Development (F-02+F-03)" speaks for F-02 and F-03; "(scaffold)" and "(finish)" for no feature; plain "Development" for all. */
export function scopeFromLabel(label: string): DevelopmentScope {
  const part = label.match(/^Development \((.+)\)$/)?.[1];
  if (!part) return undefined;
  if (part === "scaffold" || part === "finish") return "none";
  const ids = part.split("+").filter((id) => /^F-\d+$/.test(id));
  return ids.length ? ids : undefined;
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
  // Developers often write files with heredocs (cat > test/x.test.js <<'EOF').
  if (tool === "Bash") return (input as { command?: string } | null)?.command ?? "";
  return "";
}

function now(): string {
  return new Date().toISOString();
}

