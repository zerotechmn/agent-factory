import { describe, expect, test } from "bun:test";

import { createBudget, decideAllowance, recordSpend, remainingUsd } from "./pipeline.budget";

describe("decideAllowance", () => {
  test("gives the requested amount when plenty remains", () => {
    const budget = createBudget({ capUsd: 15, deployReserveUsd: 1.5 });
    expect(decideAllowance({ budget, isDeployment: false, minUsd: 0.2, requestedUsd: 6 })).toEqual({
      allowanceUsd: 6,
      kind: "go",
    });
  });

  test("never lets non-deploy stages spend the deploy reserve", () => {
    const budget = recordSpend(createBudget({ capUsd: 15, deployReserveUsd: 1.5 }), { costUsd: 12 });
    expect(decideAllowance({ budget, isDeployment: false, minUsd: 0.2, requestedUsd: 6 })).toEqual({
      allowanceUsd: 1.5,
      kind: "go",
    });
  });

  test("stops early when the allowance falls below the stage minimum", () => {
    const budget = recordSpend(createBudget({ capUsd: 15, deployReserveUsd: 1.5 }), { costUsd: 13.4 });
    const decision = decideAllowance({ budget, isDeployment: false, minUsd: 1, requestedUsd: 6 });
    expect(decision.kind).toBe("stop");
  });

  test("deployment may use everything that remains, including the reserve", () => {
    const budget = recordSpend(createBudget({ capUsd: 15, deployReserveUsd: 1.5 }), { costUsd: 13.4 });
    expect(decideAllowance({ budget, isDeployment: true, minUsd: 0.3, requestedUsd: 1 })).toEqual({
      allowanceUsd: 1.6,
      kind: "go",
    });
  });

  test("stops deployment when the cap is fully spent", () => {
    const budget = recordSpend(createBudget({ capUsd: 15, deployReserveUsd: 1.5 }), { costUsd: 15.2 });
    expect(remainingUsd(budget)).toBe(0);
    expect(decideAllowance({ budget, isDeployment: true, minUsd: 0.3, requestedUsd: 1 }).kind).toBe("stop");
  });
});

describe("recordSpend", () => {
  test("ignores negative and non-finite costs", () => {
    const budget = createBudget({ capUsd: 15, deployReserveUsd: 1.5 });
    expect(recordSpend(budget, { costUsd: Number.NaN }).spentUsd).toBe(0);
    expect(recordSpend(budget, { costUsd: -3 }).spentUsd).toBe(0);
  });
});

describe("createBudget", () => {
  test("clamps a reserve larger than the cap", () => {
    expect(createBudget({ capUsd: 1, deployReserveUsd: 1.5 }).deployReserveUsd).toBe(1);
  });
});
