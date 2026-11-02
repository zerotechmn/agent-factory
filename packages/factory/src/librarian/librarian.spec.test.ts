import { describe, expect, test } from "bun:test";

import type { BoardColumn } from "../board/board.types";
import { canonical, lookupSpec, traceSpec } from "./librarian.spec";

const handoffs = {
  architecture: {
    apiEndpoints: [{ method: "POST", operationId: "approveOrder", path: "/api/orders/:id/approve", servesScreens: ["S-02"] }],
  },
  requirements: {
    businessRules: [{ appliesTo: ["F-01", "S-02"], example: "", id: "BRL-01", rule: "Only managers approve" }],
    decisions: [],
    entities: [{ description: "", fields: [], id: "ENT-01", name: "order", pii: false, relations: [] }],
    features: [
      {
        acceptanceCriteria: [
          { given: "a pending order", id: "AC-F01-01", kind: "positive", then: "it is approved", when: "a manager approves" },
          { given: "a pending order", id: "AC-F01-02", kind: "negative", then: "403", when: "a clerk approves" },
        ],
        description: "",
        id: "F-01",
        name: "Approve order",
        priority: "Must",
        ruleIds: ["BRL-01"],
        screenIds: ["S-02"],
        userFlow: [],
      },
    ],
    nonFunctional: [],
    notifications: [],
    referenceSystems: [],
    reports: [],
    roles: [{ description: "", name: "Manager" }],
    permissions: [{ allowed: true, featureId: "F-01", role: "Manager", ruleId: null }],
    screens: [
      {
        actions: [{ featureId: "F-01", label: "Approve", result: "", rules: "visible: BRL-01" }],
        description: "",
        featureIds: ["F-01"],
        fields: [],
        id: "S-02",
        name: "Order detail",
        navigation: "",
        permissions: [],
        roles: [],
        states: [],
      },
    ],
  },
  testCases: {
    smokeChecks: [{ description: "", expectStatus: 200, id: "SMOKE-1", method: "GET", path: "/health" }],
    testCases: [
      { acceptanceCriterionIds: ["AC-F01-01"], id: "TC-1", title: "manager approves" },
      { acceptanceCriterionIds: ["AC-F1-2"], id: "TC-2", title: "clerk is refused" },
    ],
  },
};

describe("canonical", () => {
  test("ignores case and zero padding", () => {
    expect(canonical("ac-f03-02")).toBe(canonical("AC-F3-2"));
    expect(canonical("TC-10")).toBe("TC-10");
    expect(canonical("F-00")).toBe("F-0");
  });
});

describe("lookupSpec", () => {
  test("finds every kind of id", () => {
    expect(lookupSpec(handoffs, "F-1")?.kind).toBe("feature");
    expect(lookupSpec(handoffs, "AC-F01-02")).toMatchObject({ item: { featureId: "F-01" }, kind: "acceptanceCriterion" });
    expect(lookupSpec(handoffs, "s-02")?.kind).toBe("screen");
    expect(lookupSpec(handoffs, "BRL-1")?.kind).toBe("businessRule");
    expect(lookupSpec(handoffs, "ENT-01")?.kind).toBe("entity");
    expect(lookupSpec(handoffs, "TC-2")?.kind).toBe("testCase");
    expect(lookupSpec(handoffs, "SMOKE-1")?.kind).toBe("smokeCheck");
    expect(lookupSpec(handoffs, "approveorder")?.kind).toBe("endpoint");
    expect(lookupSpec(handoffs, "manager")).toMatchObject({ item: { permissions: [{ featureId: "F-01" }] }, kind: "role" });
  });

  test("returns null for unknown ids and missing handoffs", () => {
    expect(lookupSpec(handoffs, "F-99")).toBeNull();
    expect(lookupSpec({}, "F-01")).toBeNull();
  });
});

describe("traceSpec", () => {
  const columns = new Map<string, BoardColumn>([
    ["F-01", "built"],
    ["TC-1", "verified"],
    ["TC-2", "failed"],
  ]);

  test("a feature links to its criteria, rules, screens and tests with board status", () => {
    const trace = traceSpec(handoffs, columns, "F-01");
    expect(trace?.links).toEqual({
      acceptanceCriteria: ["AC-F01-01", "AC-F01-02"],
      rules: ["BRL-01"],
      screens: ["S-02"],
      tests: ["TC-1", "TC-2"],
    });
    expect(trace?.columns).toEqual({ "F-01": "built", "TC-1": "verified", "TC-2": "failed" });
  });

  test("a criterion links to its feature and tests, despite inconsistent padding", () => {
    expect(traceSpec(handoffs, columns, "AC-F01-02")?.links).toEqual({ features: ["F-01"], tests: ["TC-2"] });
  });

  test("a screen links to features, rules from its actions, and endpoints", () => {
    expect(traceSpec(handoffs, columns, "S-02")?.links).toEqual({
      endpoints: ["approveOrder (POST /api/orders/:id/approve)"],
      features: ["F-01"],
      rules: ["BRL-01"],
    });
  });

  test("a test links back to criteria and features", () => {
    expect(traceSpec(handoffs, columns, "TC-2")?.links).toEqual({ acceptanceCriteria: ["AC-F1-2"], features: ["F-01"] });
  });
});
