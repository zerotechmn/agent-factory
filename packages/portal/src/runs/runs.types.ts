export type RunStatus = "queued" | "running" | "deployed" | "deployed_partial" | "failed" | "failed_budget";

export type StageStatus = "running" | "succeeded" | "failed" | "stopped_budget" | "skipped";

export type Stage = {
  costUsd: number;
  dirName: string;
  error: string | null;
  finishedAt: string | null;
  label: string;
  seq: number;
  stageKey: string;
  startedAt: string;
  status: StageStatus;
};

export type Run = {
  appUrl: string | null;
  budgetUsd: number;
  costUsd: number;
  createdAt: string;
  currentStage: string | null;
  id: string;
  prompt: string;
  /** 1-based position while queued, otherwise null. */
  queuePosition: number | null;
  stages: Stage[];
  status: RunStatus;
  stopReason: string | null;
};

export type Envelope<T> = { data: T; message: string; status: number; type: "list" | "object" };
