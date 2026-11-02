import { describe, expect, test } from "bun:test";

import { mergeDevHandoffs, planSlices, sliceBudgets } from "./development.slices";

type Priority = "Must" | "Should" | "Could";

const feature = (n: number, screenIds: string[], priority: Priority = "Must") => ({
  acceptanceCriteria: [{ given: "", id: `AC-F0${n}-01`, kind: "positive" as const, then: "", when: "" }],
  description: "",
  id: `F-0${n}`,
  name: `Feature ${n}`,
  priority,
  ruleIds: n === 1 ? ["BRL-01"] : [],
  screenIds,
  userFlow: [],
});

const screen = (id: string, featureIds: string[], source = "order.id") => ({
  actions: [],
  description: "",
  featureIds,
  fields: [{ format: "", name: "x", note: "", required: "No", source, type: "text" }],
  id,
  name: id,
  navigation: "",
  permissions: [],
  roles: [],
  states: [],
});

const prd = (features: ReturnType<typeof feature>[], screens: ReturnType<typeof screen>[]) => ({
  assumptions: [],
  businessRules: [{ appliesTo: ["F-01"], example: "", id: "BRL-01", rule: "" }, { appliesTo: ["S-09"], example: "", id: "BRL-02", rule: "" }],
  constraints: [],
  decisions: [],
  entities: [
    { description: "", fields: [], id: "ENT-01", name: "order", pii: false, relations: [] },
    { description: "", fields: [], id: "ENT-02", name: "customer", pii: true, relations: [] },
  ],
  features,
  glossary: [],
  nonFunctional: [],
  notifications: [],
  objective: "",
  outOfScope: [],
  permissions: [],
  referenceSystems: [],
  reports: [],
  roles: [],
  scope: [],
  screens,
  title: "T",
});

const fivefeatures = prd(
  [feature(1, ["S-01"]), feature(2, ["S-02"], "Could"), feature(3, ["S-02"]), feature(4, ["S-04"], "Should"), feature(5, ["S-05"])],
  [screen("S-01", ["F-01"]), screen("S-02", ["F-02", "F-03"], "customer.name"), screen("S-04", ["F-04"]), screen("S-05", ["F-05"])],
);
const testPlan = {
  smokeChecks: [],
  testCases: [
    { acceptanceCriterionIds: ["AC-F01-01"], id: "TC-1" },
    { acceptanceCriterionIds: ["AC-F03-01"], id: "TC-3" },
    { acceptanceCriterionIds: ["AC-F02-01", "AC-F05-01"], id: "TC-9" },
  ],
};
const architecture = {
  apiEndpoints: [
    { operationId: "listOrders", servesScreens: ["S-01"] },
    { operationId: "updateCustomer", servesScreens: ["S-02", "S-05"] },
  ],
};
const uiDesign = { screens: [{ screenId: "S-01" }, { screenId: "S-02" }, { id: "S-05" }], tokens: [] };

describe("planSlices", () => {
  const slices = planSlices({ architecture, minSlices: 3, prd: fivefeatures, testPlan, uiDesign })!;

  test("groups features that share a screen and builds Must before Should before Could", () => {
    expect(slices.map((s) => s.id)).toEqual(["F-01", "F-03+F-02", "F-05", "F-04"]);
  });

  test("each slice carries only its own tests, endpoints, rules, entities and UI screens", () => {
    const shared = slices[1]!;
    expect(shared.screenIds).toEqual(["S-02"]);
    expect(shared.testCases.map((t) => t.id)).toEqual(["TC-3", "TC-9"]);
    expect(shared.endpoints.map((e) => e.operationId)).toEqual(["updateCustomer"]);
    expect(shared.entities.map((e) => e.name)).toEqual(["customer"]);
    expect(shared.uiScreens).toEqual([{ screenId: "S-02" }]);
    expect(slices[0]!.rules.map((r) => r.id)).toEqual(["BRL-01"]);
    expect(slices[2]!.uiScreens).toEqual([{ id: "S-05" }]);
  });

  test("small apps stay in one session", () => {
    const small = prd([feature(1, ["S-01"]), feature(2, ["S-01"]), feature(3, ["S-03"])], [screen("S-01", ["F-01", "F-02"]), screen("S-03", ["F-03"])]);
    expect(planSlices({ architecture, minSlices: 3, prd: small, testPlan, uiDesign })).toBeNull();
    expect(planSlices({ architecture, minSlices: 3, prd: null, testPlan, uiDesign })).toBeNull();
  });

  test("never more than six sessions: the smallest groups merge with a neighbour", () => {
    const many = prd(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => feature(n, [`S-0${n}`])),
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => screen(`S-0${n}`, [`F-0${n}`])),
    );
    const planned = planSlices({ architecture, minSlices: 3, prd: many, testPlan, uiDesign })!;
    expect(planned).toHaveLength(6);
    expect(planned.flatMap((s) => s.featureIds)).toEqual(["F-01", "F-02", "F-03", "F-04", "F-05", "F-06", "F-07", "F-08"]);
  });
});

describe("mergeDevHandoffs", () => {
  test("latest commands and screen paths, everything else combined", () => {
    const merged = mergeDevHandoffs(
      [
        { commands: { install: "npm ci", start: "node a", test: "npm test" }, filesChanged: ["a.js"], notes: "routes in server/routes", testsWritten: [] },
        { filesChanged: ["a.js", "b.js"], knownGaps: ["F-02: export missing"], screens: [{ note: "", path: "/x", screenId: "S-02" }], testsWritten: ["TC-3"] },
        { buildVerified: true, commands: { install: "npm ci", start: "node server.js", test: "npm test" }, screens: [{ note: "", path: "/orders", screenId: "S-02" }], testsWritten: ["TC-3", "TC-9"] },
      ],
      { extraGaps: ["F-04: not built (budget)"] },
    );
    expect(merged).toMatchObject({
      buildVerified: true,
      commands: { start: "node server.js" },
      filesChanged: ["a.js", "b.js"],
      knownGaps: ["F-02: export missing", "F-04: not built (budget)"],
      notes: "routes in server/routes",
      screens: [{ path: "/orders", screenId: "S-02" }],
      testsWritten: ["TC-3", "TC-9"],
    });
  });
});

describe("sliceBudgets", () => {
  test("scaffold and finish are fixed; features share the rest within bounds", () => {
    expect(sliceBudgets({ count: 3, poolUsd: 7 })).toEqual({ featureUsd: 1.5, finishUsd: 1, scaffoldUsd: 1.5 });
    expect(sliceBudgets({ count: 6, poolUsd: 7 }).featureUsd).toBe(0.8);
    expect(sliceBudgets({ count: 2, poolUsd: 7 }).featureUsd).toBe(2);
  });
});
