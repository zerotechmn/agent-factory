import type { BoardCard, BoardColumn, CardSeed } from "./board.types";

type PrdLike = {
  features?: { acceptanceCriteria?: { id: string }[]; id: string; name: string; priority?: string; screenIds?: string[] }[];
  screens?: { featureIds?: string[]; id: string; name: string }[];
};

type TestPlanLike = {
  smokeChecks?: { description: string; expectStatus: number; id: string; method: string; path: string }[];
  testCases?: { acceptanceCriterionIds?: string[]; id: string; title: string; type?: string }[];
};

export function seedsFromPrd(prd: unknown): CardSeed[] {
  const { features = [], screens = [] } = (prd ?? {}) as PrdLike;
  return [
    ...features.map((f) => ({
      id: f.id,
      kind: "feature" as const,
      links: f.screenIds ?? [],
      note: f.priority ? `${f.priority} · ${f.acceptanceCriteria?.length ?? 0} acceptance criteria` : "",
      title: f.name,
    })),
    ...screens.map((s) => ({ id: s.id, kind: "screen" as const, links: s.featureIds ?? [], note: "", title: s.name })),
  ];
}

/** Test cards link to the features whose acceptance criteria they cover. */
export function seedsFromTestPlan(plan: unknown, prd: unknown): CardSeed[] {
  const { smokeChecks = [], testCases = [] } = (plan ?? {}) as TestPlanLike;
  const featureOf = new Map<string, string>();
  for (const f of ((prd ?? {}) as PrdLike).features ?? []) {
    for (const ac of f.acceptanceCriteria ?? []) featureOf.set(ac.id, f.id);
  }
  return [
    ...testCases.map((t) => ({
      id: t.id,
      kind: "test" as const,
      links: unique((t.acceptanceCriterionIds ?? []).map((ac) => featureOf.get(ac)).filter((f): f is string => Boolean(f))),
      note: [t.type, ...(t.acceptanceCriterionIds ?? [])].filter(Boolean).join(" · "),
      title: t.title,
    })),
    ...smokeChecks.map((s) => ({
      id: s.id,
      kind: "smoke" as const,
      links: [],
      note: `${s.method} ${s.path} → ${s.expectStatus}`,
      title: s.description,
    })),
  ];
}

// Test names come from many runners and languages: "TC-3", "TC-03", "TC_3"
// (Python identifiers can't hold "-"), "TC-17/TC-49". The letter guard stops
// "ETC-1" from matching.
const TEST_ID = /(?:^|[^A-Za-z])TC[-_ ]?(\d+)/gi;

/** Canonical form, so "TC-03" in a test name finds the plan's "TC-3" and vice versa. */
export function testKey(id: string): string {
  const digits = /(\d+)/.exec(id)?.[1];
  return digits ? `TC-${Number(digits)}` : id.toUpperCase();
}

export function testIdsIn(text: string): string[] {
  return unique(Array.from(text.matchAll(TEST_ID), (m) => `TC-${Number(m[1])}`));
}

// One result line per test in TAP (node --test, tap), spec reporters (node,
// mocha, jest, vitest), bun test and pytest -v. Failure detail blocks
// ("●" in jest, "FAIL file > name" in vitest) count as failures too.
const FAILED_LINE = /^\s*(?:not ok\s+\d+|[✗✕×✘✖●]|\(fail\)|FAIL(?:ED)?\b)|\bFAILED\b/;
const PASSED_LINE = /^\s*(?:ok\s+\d+|[✓✔√]|\(pass\)|PASS(?:ED)?\b)|\bPASSED\b/;

/**
 * Per test case result from a test log, keyed by canonical id. A failure on
 * any line beats passes elsewhere (a case can span several tests). Cases the
 * log never names are absent: many runners print only failures.
 */
export function parseTestLog(log: string): Map<string, "failed" | "passed"> {
  const results = new Map<string, "failed" | "passed">();
  for (const line of log.split("\n")) {
    const outcome = FAILED_LINE.test(line) ? "failed" : PASSED_LINE.test(line) ? "passed" : null;
    if (!outcome) continue;
    for (const id of testIdsIn(line)) {
      if (results.get(id) !== "failed") results.set(id, outcome);
    }
  }
  return results;
}

/**
 * Where a test card goes after a full verify. Without a per-test line, a
 * green suite still proves every written test passes; a red one proves nothing
 * about this case, so it stays put.
 */
export function testColumnAfterVerify({
  card,
  logResult,
  suitePassed,
  written,
}: {
  card: Pick<BoardCard, "column">;
  logResult: "failed" | "passed" | undefined;
  suitePassed: boolean;
  written: boolean;
}): { column: BoardColumn; note: string } | null {
  if (logResult === "failed") return { column: "failed", note: "Failing in the test run" };
  if (logResult === "passed") return { column: "verified", note: "Passing in the test run" };
  if (suitePassed && written) return { column: "verified", note: "Suite passed (the log doesn't list this case)" };
  if (!written && card.column === "todo") return { column: "todo", note: "No automated test found for this case" };
  return null;
}

/** A feature is as done as its tests: any failing → failed, all passing → verified. */
export function featureColumnFromTests(tests: Pick<BoardCard, "column">[]): BoardColumn | null {
  if (tests.length === 0) return null;
  if (tests.some((t) => t.column === "failed")) return "failed";
  if (tests.every((t) => t.column === "verified")) return "verified";
  return null;
}

/** Any test in progress → in progress; every test passing locally → built. */
export function featureColumnWhileBuilding(tests: Pick<BoardCard, "column">[]): BoardColumn | null {
  if (tests.length === 0) return null;
  if (tests.some((t) => t.column === "doing")) return "doing";
  if (tests.every((t) => t.column === "built" || t.column === "verified")) return "built";
  return null;
}

/**
 * Totals from a test run's summary, for when output is cut down to counts
 * (agents often pipe through grep or tail). Covers TAP/node --test, bun,
 * jest/vitest, mocha and pytest; null when the text isn't a test summary.
 */
export function parseTestCounts(output: string): { failed: number; passed: number } | null {
  const num = (re: RegExp) => {
    const m = re.exec(output);
    return m ? Number(m[1]) : null;
  };
  const passed =
    num(/^# pass (\d+)/m) ?? num(/^\s*(\d+) pass$/m) ?? num(/^\s*Tests?:?\s+.*?(\d+) passed/m) ?? num(/(\d+) passing\b/) ?? num(/^=+ .*?(\d+) passed/m);
  const failed =
    num(/^# fail (\d+)/m) ?? num(/^\s*(\d+) fail$/m) ?? num(/^\s*Tests?:?\s+.*?(\d+) failed/m) ?? num(/(\d+) failing\b/) ?? num(/^=+ .*?(\d+) failed/m);
  if (passed === null && failed === null) return null;
  return { failed: failed ?? 0, passed: passed ?? 0 };
}

/** A tool result's text, whether the SDK gives it as a string or as content blocks. */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join("\n");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
