import { describe, expect, test } from "bun:test";

import { featureColumnFromTests, parseTestLog, seedsFromTestPlan, testColumnAfterVerify, testIdsIn } from "./board.utils";

describe("testIdsIn", () => {
  test("finds ids in the forms test names use", () => {
    expect(testIdsIn("TC-17/TC-49: renter books 3 days")).toEqual(["TC-17", "TC-49"]);
    expect(testIdsIn("def test_tc_03_rejects_past_dates():")).toEqual(["TC-3"]);
    expect(testIdsIn("it('TC 5 works')")).toEqual(["TC-5"]);
    expect(testIdsIn("ETC-1 and TCX-2")).toEqual([]);
  });
});

describe("parseTestLog", () => {
  test("reads node --test TAP output", () => {
    const log = [
      "# Subtest: TC-18: renter creates Pending booking",
      "ok 1 - TC-18: renter creates Pending booking",
      "not ok 2 - TC-19 / TC-23: end before start rejected",
      "# fail 1",
    ].join("\n");
    const results = parseTestLog(log);
    expect(results.get("TC-18")).toBe("passed");
    expect(results.get("TC-19")).toBe("failed");
    expect(results.get("TC-23")).toBe("failed");
  });

  test("reads spec reporters, bun and pytest, and a failure beats a pass", () => {
    const log = [
      "  ✓ TC-1 lists items (3 ms)",
      "  × TC-2 rejects empty title",
      "(pass) TC-4 > quote",
      "(fail) TC-4 > second assertion",
      "tests/test_api.py::test_tc_7_create PASSED",
      "FAIL src/api.test.ts > TC-8 deletes",
    ].join("\n");
    const results = parseTestLog(log);
    expect(Object.fromEntries(results)).toEqual({ "TC-1": "passed", "TC-2": "failed", "TC-4": "failed", "TC-7": "passed", "TC-8": "failed" });
  });

  test("ignores lines that only mention an id", () => {
    expect(parseTestLog("# Subtest: TC-9 something").size).toBe(0);
  });
});

describe("testColumnAfterVerify", () => {
  const card = { column: "built" as const };
  test("a named result wins; a green suite verifies written tests; a red one proves nothing", () => {
    expect(testColumnAfterVerify({ card, logResult: "failed", suitePassed: false, written: true })?.column).toBe("failed");
    expect(testColumnAfterVerify({ card, logResult: undefined, suitePassed: true, written: true })?.column).toBe("verified");
    expect(testColumnAfterVerify({ card, logResult: undefined, suitePassed: false, written: true })).toBeNull();
    expect(testColumnAfterVerify({ card: { column: "todo" }, logResult: undefined, suitePassed: true, written: false })?.note).toContain(
      "No automated test",
    );
  });
});

describe("features and links", () => {
  test("test cards link to the features owning their acceptance criteria", () => {
    const prd = { features: [{ acceptanceCriteria: [{ id: "AC-F01-01" }], id: "F-01", name: "Book" }] };
    const plan = { smokeChecks: [], testCases: [{ acceptanceCriterionIds: ["AC-F01-01"], id: "TC-1", title: "Books", type: "api" }] };
    expect(seedsFromTestPlan(plan, prd)[0]?.links).toEqual(["F-01"]);
  });

  test("a feature fails with any failing test and is verified only when all pass", () => {
    expect(featureColumnFromTests([{ column: "verified" }, { column: "failed" }])).toBe("failed");
    expect(featureColumnFromTests([{ column: "verified" }, { column: "verified" }])).toBe("verified");
    expect(featureColumnFromTests([{ column: "verified" }, { column: "built" }])).toBeNull();
    expect(featureColumnFromTests([])).toBeNull();
  });
});
