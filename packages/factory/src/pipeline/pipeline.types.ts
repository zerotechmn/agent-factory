/** Stages run by an LLM agent. Testing and deployment only run to repair a failed verify gate. */
export const AGENT_STAGE_KEYS = [
  "research",
  "requirements",
  "prdReview",
  "testCases",
  "architecture",
  "uiDesign",
  "development",
  "acceptance",
  "review",
  "testing",
  "deployment",
] as const;

export type AgentStageKey = (typeof AGENT_STAGE_KEYS)[number];

/** "verify" is the deterministic gate: plain code, no LLM, no cost. */
export const STAGE_KEYS = [...AGENT_STAGE_KEYS, "verify"] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

/**
 * "zt": the ZT Design System (React + Ant Design 6), for business and internal
 * apps. "custom": a distinctive design per product (frontend-design skill),
 * for consumer apps the ZT templates don't cover. Chosen per run.
 */
export const DESIGN_SYSTEMS = ["zt", "custom"] as const;

export type DesignSystem = (typeof DESIGN_SYSTEMS)[number];

export const DEFAULT_DESIGN_SYSTEM: DesignSystem = "zt";

export const RUN_STATUSES = [
  "queued",
  "running",
  // Paused between stages for the customer's answers; still holds its run slot.
  "waiting_customer",
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
  model: string;
  /** Plugin skills (`factory:<name>`) this agent may load; empty hides all skills. */
  skills: string[];
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
