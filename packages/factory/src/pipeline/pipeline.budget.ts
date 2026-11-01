import type { LedgerEntry } from "./pipeline.types";

export type Budget = {
  capUsd: number;
  deployReserveUsd: number;
  spentUsd: number;
};

export type AllowanceDecision =
  | { allowanceUsd: number; kind: "go" }
  | { kind: "stop"; reason: string };

export function createBudget({ capUsd, deployReserveUsd }: { capUsd: number; deployReserveUsd: number }): Budget {
  return {
    capUsd: Math.max(capUsd, 0),
    // A reserve larger than the cap would block every stage; clamp it.
    deployReserveUsd: Math.min(Math.max(deployReserveUsd, 0), Math.max(capUsd, 0)),
    spentUsd: 0,
  };
}

export function remainingUsd(budget: Budget): number {
  return Math.max(budget.capUsd - budget.spentUsd, 0);
}

/**
 * Decides how much a stage may spend. Non-deploy stages never eat into the
 * deploy reserve, so an early stop can still ship whatever was built.
 */
export function decideAllowance({
  budget,
  isDeployment,
  minUsd,
  requestedUsd,
}: {
  budget: Budget;
  isDeployment: boolean;
  minUsd: number;
  requestedUsd: number;
}): AllowanceDecision {
  const remaining = remainingUsd(budget);
  const spendable = isDeployment ? remaining : Math.max(remaining - budget.deployReserveUsd, 0);
  const allowanceUsd = roundUsd(isDeployment ? spendable : Math.min(requestedUsd, spendable));

  if (allowanceUsd < minUsd) {
    return {
      kind: "stop",
      reason: `Budget exhausted: $${allowanceUsd.toFixed(2)} available, stage needs at least $${minUsd.toFixed(2)} (spent $${budget.spentUsd.toFixed(2)} of $${budget.capUsd.toFixed(2)}).`,
    };
  }

  return { allowanceUsd, kind: "go" };
}

export function recordSpend(budget: Budget, entry: Pick<LedgerEntry, "costUsd">): Budget {
  const cost = Number.isFinite(entry.costUsd) ? Math.max(entry.costUsd, 0) : 0;
  return { ...budget, spentUsd: roundUsd(budget.spentUsd + cost) };
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
