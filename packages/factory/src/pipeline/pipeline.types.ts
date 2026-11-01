export const STAGE_KEYS = [
  "requirements",
  "testCases",
  "design",
  "development",
  "review",
  "testing",
  "deployment",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export const RUN_STATUSES = [
  "queued",
  "running",
  "deployed",
  "deployed_partial",
  "failed",
  "failed_budget",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const STAGE_STATUSES = ["running", "succeeded", "failed", "stopped_budget", "skipped"] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export type StageSettings = {
  /** Default USD allocation for one invocation of this stage. */
  budgetUsd: number;
  effort: EffortLevel;
  label: string;
  maxTurns: number;
  /** Below this allowance the stage is not worth starting; the run stops early instead. */
  minUsd: number;
  timeoutMs: number;
};

/** One agent invocation as recorded in ledger.jsonl and the stages table. */
export type LedgerEntry = {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  outcome: string;
  stageDir: string;
  stageKey: StageKey;
  timestamp: string;
};
