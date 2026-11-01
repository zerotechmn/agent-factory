import { describe, expect, test } from "bun:test";

import {
  availableUsd,
  commitAllowance,
  createBudget,
  decideAllowance,
  recordSpend,
  remainingUsd,
} from "./pipeline.budget";

const fresh = () => createBudget({ capUsd: 15, deployReserveUsd: 1 });

describe("decideAllowance", () => {
  test("gives the requested amount when plenty remains", () => {
    expect(decideAllowance({ budget: fresh(), canUseReserve: false, minUsd: 0.2, requestedUsd: 7 })).toEqual({
      allowanceUsd: 7,
      kind: "go",
    });
  });

  test("never lets ordinary stages spend the deploy reserve", () => {
    const budget = recordSpend(fresh(), { costUsd: 12.5 });
    expect(decideAllowance({ budget, canUseReserve: false, minUsd: 0.2, requestedUsd: 7 })).toEqual({
      allowanceUsd: 1.5,
      kind: "go",
    });
  });

  test("stops early when the allowance falls below the stage minimum", () => {
    const budget = recordSpend(fresh(), { costUsd: 13.4 });
    expect(decideAllowance({ budget, canUseReserve: false, minUsd: 1, requestedUsd: 7 }).kind).toBe("stop");
  });

  test("the repair stage may use the reserve, but only up to what it asks for", () => {
    const budget = recordSpend(fresh(), { costUsd: 13.4 });
    expect(decideAllowance({ budget, canUseReserve: true, minUsd: 0.25, requestedUsd: 0.75 })).toEqual({
      allowanceUsd: 0.75,
      kind: "go",
    });
    const nearlySpent = recordSpend(fresh(), { costUsd: 14.5 });
    expect(decideAllowance({ budget: nearlySpent, canUseReserve: true, minUsd: 0.25, requestedUsd: 0.75 })).toEqual({
      allowanceUsd: 0.5,
      kind: "go",
    });
  });

  test("stops even the repair stage when the cap is fully spent", () => {
    const budget = recordSpend(fresh(), { costUsd: 15.2 });
    expect(remainingUsd(budget)).toBe(0);
    expect(decideAllowance({ budget, canUseReserve: true, minUsd: 0.25, requestedUsd: 0.75 }).kind).toBe("stop");
  });
});

describe("parallel stages", () => {
  test("a committed allowance is not handed out twice", () => {
    // $3 spendable above the reserve; two parallel stages each ask for $2.
    let budget = recordSpend(fresh(), { costUsd: 11 });
    const first = decideAllowance({ budget, canUseReserve: false, minUsd: 0.2, requestedUsd: 2 });
    expect(first).toEqual({ allowanceUsd: 2, kind: "go" });
    budget = commitAllowance(budget, 2);

    const second = decideAllowance({ budget, canUseReserve: false, minUsd: 0.2, requestedUsd: 2 });
    expect(second).toEqual({ allowanceUsd: 1, kind: "go" });
    budget = commitAllowance(budget, 1);

    expect(availableUsd(budget)).toBe(1);
    expect(decideAllowance({ budget, canUseReserve: false, minUsd: 0.2, requestedUsd: 2 }).kind).toBe("stop");
  });

  test("finishing a stage books its real cost and frees the unused allowance", () => {
    let budget = commitAllowance(fresh(), 2);
    expect(availableUsd(budget)).toBe(13);
    budget = recordSpend(budget, { costUsd: 0.5 }, { releaseUsd: 2 });
    expect(budget.committedUsd).toBe(0);
    expect(budget.spentUsd).toBe(0.5);
    expect(availableUsd(budget)).toBe(14.5);
  });
});

describe("recordSpend", () => {
  test("ignores negative and non-finite costs", () => {
    expect(recordSpend(fresh(), { costUsd: Number.NaN }).spentUsd).toBe(0);
    expect(recordSpend(fresh(), { costUsd: -3 }).spentUsd).toBe(0);
  });

  test("never drives the committed amount negative", () => {
    expect(recordSpend(fresh(), { costUsd: 0 }, { releaseUsd: 5 }).committedUsd).toBe(0);
  });
});

describe("createBudget", () => {
  test("clamps a reserve larger than the cap", () => {
    expect(createBudget({ capUsd: 1, deployReserveUsd: 1.5 }).deployReserveUsd).toBe(1);
  });
});
