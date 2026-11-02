import { describe, expect, test } from "bun:test";

import { checkPrdQuality, SCOPE_LIMITS } from "../requirements/requirements.validate";
import { renderPrdReview } from "./prd-review.report";
import { coverageIssues, prdReviewSchema, type PrdReview } from "./prd-review.schema";

const review: PrdReview = {
  extras: [{ id: "F-07", reason: "a referral programme the customer never mentioned" }],
  requests: [
    { coveredBy: ["F-01", "S-02"], note: "", quote: "browse the catalogue with filters", status: "covered" },
    { coveredBy: ["F-03"], note: "the cleaning fee is not added to the total", quote: "days × daily price + cleaning fee", status: "partial" },
    { coveredBy: [], note: "", quote: "an earnings summary of completed rentals", status: "missing" },
    { coveredBy: [], note: "", quote: "pay by card", status: "out-of-scope" },
  ],
};

describe("PRD coverage check", () => {
  test("missing and partial requests and unrequested features become problems; deliberate exclusions don't", () => {
    expect(prdReviewSchema.safeParse(review).success).toBe(true);
    expect(coverageIssues(review)).toEqual([
      'Customer asked: "days × daily price + cleaning fee" — only partly covered by F-03 (the cleaning fee is not added to the total)',
      'Customer asked: "an earnings summary of completed rentals" — not covered by any PRD item',
      "F-07 was not asked for: a referral programme the customer never mentioned. Move it to outOfScope unless the request needs it",
    ]);
  });

  test("the report counts each status and lists what to fix", () => {
    const md = renderPrdReview(review);
    expect(md).toContain("4 requests: 1 covered, 1 partly covered, 1 missing, 1 deliberately out of scope. 1 PRD item(s) were not asked for.");
    expect(md).toContain("| an earnings summary of completed rentals | ✕ missing | — | — |");
    expect(md).toContain("**3 problem(s) to fix.**");
  });
});

describe("PRD testability and scope", () => {
  const ac = (kind: "negative" | "positive", n: number) => ({ given: "g", id: `AC-F01-0${n}`, kind, then: "t", when: "w" });
  const feature = (id: string, kinds: ("negative" | "positive")[], ruleIds: string[] = []) => ({
    acceptanceCriteria: kinds.map((k, i) => ({ ...ac(k, i + 1), id: `AC-${id.replace("-", "")}-0${i + 1}` })),
    description: "",
    id,
    name: id,
    priority: "Must" as const,
    ruleIds,
    screenIds: [],
    userFlow: [],
  });
  const screen = (id: string, states: { kind?: string; state: string }[]) => ({ id, states: states.map((s) => ({ display: "", ...s })) });

  test("flags features that can't be tested both ways and screens without loading or error states", () => {
    const prd = {
      businessRules: [{ appliesTo: ["F-01"], example: " ", id: "BRL-01", rule: "r" }],
      features: [feature("F-01", ["positive"], ["BRL-01"]), feature("F-02", ["negative"])],
      // S-02 is an older PRD without kinds: English state names still count.
      screens: [screen("S-01", [{ kind: "empty", state: "Хоосон" }]), screen("S-02", [{ state: "Loading" }, { state: "Error" }])],
    };
    expect(checkPrdQuality(prd as never)).toEqual({
      scope: [],
      testability: [
        "F-01: uses BRL-01 but has no negative acceptance criterion",
        "F-02: no positive acceptance criterion (what success looks like)",
        "BRL-01: no worked example",
        "S-01: no loading state (what users see while data loads)",
        "S-01: no error state (what users see when loading or saving fails)",
      ],
    });
  });

  test("flags a scope too big for one run", () => {
    const many = Array.from({ length: SCOPE_LIMITS.features + 1 }, (_, i) => feature(`F-${String(i + 1).padStart(2, "0")}`, ["positive", "negative"]));
    const prd = { businessRules: [], features: many, screens: [] };
    expect(checkPrdQuality(prd as never).scope).toEqual(["9 features (limit 8): cut to an MVP and move the rest to outOfScope"]);
  });
});
