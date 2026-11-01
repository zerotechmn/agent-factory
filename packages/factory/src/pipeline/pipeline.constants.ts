import type { StageKey, StageSettings } from "./pipeline.types";

const MINUTE = 60_000;

// Allocations sum to ~$10.5 for one straight pass, leaving room under the $15 cap
// for the deploy reserve plus roughly one review/test/fix loop.
export const STAGE_SETTINGS: Record<StageKey, StageSettings> = {
  deployment: { budgetUsd: 1.0, effort: "medium", label: "Deployment", maxTurns: 40, minUsd: 0.3, timeoutMs: 20 * MINUTE },
  design: { budgetUsd: 1.0, effort: "high", label: "Design", maxTurns: 20, minUsd: 0.3, timeoutMs: 10 * MINUTE },
  development: { budgetUsd: 6.0, effort: "high", label: "Development", maxTurns: 250, minUsd: 1.0, timeoutMs: 45 * MINUTE },
  requirements: { budgetUsd: 0.5, effort: "medium", label: "Requirements", maxTurns: 10, minUsd: 0.15, timeoutMs: 5 * MINUTE },
  review: { budgetUsd: 1.0, effort: "medium", label: "Review", maxTurns: 60, minUsd: 0.3, timeoutMs: 15 * MINUTE },
  testCases: { budgetUsd: 0.5, effort: "medium", label: "Test cases", maxTurns: 10, minUsd: 0.15, timeoutMs: 5 * MINUTE },
  testing: { budgetUsd: 1.5, effort: "medium", label: "Testing", maxTurns: 120, minUsd: 0.4, timeoutMs: 25 * MINUTE },
};

/** Budget for a development invocation that fixes review/test findings. */
export const FIX_BUDGET_USD = 1.5;

/** Always held back so a buildable workspace can still be deployed after an early stop. */
export const DEPLOY_RESERVE_USD = 1.5;

export const MAX_FIX_ATTEMPTS = 2;

/** Port every generated app must listen on inside its container (overridable via $PORT). */
export const APP_PORT = 8080;
