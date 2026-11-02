import { describe, expect, test } from "bun:test";

import { computeRunMetrics, summarize, type RunData } from "./benchmark.metrics";
import { renderBenchmark } from "./benchmark.report";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 2, 10, minute)).toISOString();

// Shaped like a real run: verify fails on tests, one fix round, then passes with acceptance in advisory mode.
const data: RunData = {
  handoffs: {
    "03-test-cases": { testCases: [{}, {}, {}, {}] },
    "07-acceptance": { coverage: [{ kind: "api" }, { kind: "api" }, { kind: "e2e" }, { kind: "skipped" }] },
    "08-verify": { failedSteps: ["tests"], mode: "full", passed: false },
    "09-review": { findings: [{ severity: "major" }, { severity: "minor" }] },
    "11-verify-round-2": { acceptance: { failed: 1, mode: "advisory", passed: 5, skipped: null }, failedSteps: [], mode: "full", passed: true },
    "12-verify-final": { failedSteps: [], mode: "container", passed: true },
  },
  lessonsRecorded: 1,
  librarianCalls: 4,
  run: { costUsd: 6.4, createdAt: at(0), id: "abcdefghij", status: "deployed", updatedAt: at(31) },
  stages: [
    { costUsd: 0.2, dirName: "03-test-cases", finishedAt: at(4), label: "Test cases", stageKey: "testCases", startedAt: at(3), status: "succeeded" },
    { costUsd: 3.9, dirName: "06-development", finishedAt: at(22), label: "Development", stageKey: "development", startedAt: at(6), status: "succeeded" },
    { costUsd: 0.4, dirName: "07-acceptance", finishedAt: at(9), label: "Acceptance tests", stageKey: "acceptance", startedAt: at(6), status: "succeeded" },
    { costUsd: 0, dirName: "08-verify", finishedAt: at(24), label: "Verify", stageKey: "verify", startedAt: at(22), status: "failed" },
    { costUsd: 0.2, dirName: "09-review", finishedAt: at(23), label: "Review", stageKey: "review", startedAt: at(22), status: "succeeded" },
    { costUsd: 1.1, dirName: "10-development-fix-1", finishedAt: at(28), label: "Fix 1", stageKey: "development", startedAt: at(24), status: "succeeded" },
    { costUsd: 0, dirName: "11-verify-round-2", finishedAt: at(30), label: "Verify (round-2)", stageKey: "verify", startedAt: at(28), status: "succeeded" },
    { costUsd: 0, dirName: "12-verify-final", finishedAt: at(31), label: "Verify (final)", stageKey: "verify", startedAt: at(30), status: "succeeded" },
  ],
};

describe("benchmark metrics", () => {
  test("reads cost, time, fix rounds, first verify, acceptance and coverage from a run", () => {
    expect(computeRunMetrics(data)).toEqual({
      acceptance: { failed: 1, mode: "advisory", passed: 5, skipped: null },
      acceptanceCoverage: { covered: 3, planned: 4 },
      costUsd: 6.4,
      devCostUsd: 5,
      devMinutes: 20,
      firstVerifyFailedSteps: ["tests"],
      firstVerifyPassed: false,
      fixRounds: 1,
      lessonsRecorded: 1,
      librarianCalls: 4,
      minutes: 31,
      reviewBlocking: 1,
      runId: "abcdefghij",
      status: "deployed",
    });
  });

  test("summarizes a set and renders deltas against a baseline", () => {
    const m = computeRunMetrics(data);
    const clean = { ...m, acceptance: { failed: 0, mode: "blocking", passed: 6, skipped: null }, costUsd: 5, firstVerifyPassed: true, fixRounds: 0 };
    const summary = summarize([m, clean]);
    expect(summary).toMatchObject({ acceptancePassRate: 0.917, deployed: 2, firstVerifyPassRate: 0.5, meanCostUsd: 5.7, totalFixRounds: 1 });

    const md = renderBenchmark({
      baseline: { label: "base", summary: summarize([m]) },
      metrics: [{ ...clean, promptId: "habit-tracker" }],
      record: { gitCommit: "0123456789", label: "next", runs: [], startedAt: at(0) },
      summary: summarize([clean]),
    });
    expect(md).toContain("| Acceptance pass rate (independent) | 100% | 83% | +0.167 ✓ |");
    expect(md).toContain("| Fix rounds (total) | 0 | 1 | -1 ✓ |");
    expect(md).toContain("| habit-tracker | abcdefghij | deployed |");
  });
});
