import type { LedgerEntry } from "./pipeline.types";

export type Budget = {
  capUsd: number;
  /** Allowances handed to stages that are still running. */
  committedUsd: number;
  deployReserveUsd: number;
  /** Held back from the build so the first verify failure can always be fixed. */
  fixReserveUsd: number;
  spentUsd: number;
};

/**
 * Which reserves a stage may draw on. "build": neither (spec, design, the
 * first build, the first review). "repair": the fix reserve (fix rounds, test
 * triage, re-reviews). "deploy": both (deployment repair, the last resort).
 */
export type ReserveAccess = "build" | "deploy" | "repair";

export type AllowanceDecision =
  | { allowanceUsd: number; kind: "go" }
  | { kind: "stop"; reason: string };

export function createBudget({
  capUsd,
  deployReserveUsd,
  fixReserveUsd = 0,
}: {
  capUsd: number;
  deployReserveUsd: number;
  fixReserveUsd?: number;
}): Budget {
  const cap = Math.max(capUsd, 0);
  // Reserves larger than the cap would block every stage; clamp them, deploy first.
  const deployReserve = Math.min(Math.max(deployReserveUsd, 0), cap);
  return {
    capUsd: cap,
    committedUsd: 0,
    deployReserveUsd: deployReserve,
    fixReserveUsd: Math.min(Math.max(fixReserveUsd, 0), cap - deployReserve),
    spentUsd: 0,
  };
}

/** Money not yet spent. Running stages' allowances still count as unspent here. */
export function remainingUsd(budget: Budget): number {
  return Math.max(budget.capUsd - budget.spentUsd, 0);
}

/** Money neither spent nor promised to a running stage. */
export function availableUsd(budget: Budget): number {
  return Math.max(budget.capUsd - budget.spentUsd - budget.committedUsd, 0);
}

/**
 * Decides how much a stage may spend. Build stages never eat into either
 * reserve, so a run that spends heavily on the first build still has money
 * to fix what verify finds, and an early stop can still repair and ship
 * whatever was built. Fix stages may use the fix reserve; only deployment
 * repair may use the deploy reserve.
 */
export function decideAllowance({
  access,
  budget,
  minUsd,
  requestedUsd,
}: {
  access: ReserveAccess;
  budget: Budget;
  minUsd: number;
  requestedUsd: number;
}): AllowanceDecision {
  const available = availableUsd(budget);
  const held = access === "deploy" ? 0 : access === "repair" ? budget.deployReserveUsd : budget.deployReserveUsd + budget.fixReserveUsd;
  const spendable = Math.max(available - held, 0);
  const allowanceUsd = roundUsd(Math.min(Math.max(requestedUsd, 0), spendable));

  if (allowanceUsd < minUsd) {
    return {
      kind: "stop",
      reason: `Budget exhausted: $${allowanceUsd.toFixed(2)} available, stage needs at least $${minUsd.toFixed(2)} (spent $${budget.spentUsd.toFixed(2)} of $${budget.capUsd.toFixed(2)}).`,
    };
  }

  return { allowanceUsd, kind: "go" };
}

/**
 * Reserves a stage's allowance the moment it starts. Without this, two stages
 * started in parallel would each see the same free money and could together
 * exceed the cap.
 */
export function commitAllowance(budget: Budget, allowanceUsd: number): Budget {
  return { ...budget, committedUsd: roundUsd(budget.committedUsd + Math.max(allowanceUsd, 0)) };
}

/** Books a finished stage's actual cost and releases the allowance it was holding. */
export function recordSpend(
  budget: Budget,
  entry: Pick<LedgerEntry, "costUsd">,
  { releaseUsd = 0 }: { releaseUsd?: number } = {},
): Budget {
  const cost = Number.isFinite(entry.costUsd) ? Math.max(entry.costUsd, 0) : 0;
  return {
    ...budget,
    committedUsd: roundUsd(Math.max(budget.committedUsd - Math.max(releaseUsd, 0), 0)),
    spentUsd: roundUsd(budget.spentUsd + cost),
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
