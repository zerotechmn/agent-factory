export type DesignSystem = "zt" | "custom";

export type RunStatus = "queued" | "running" | "waiting_customer" | "deployed" | "deployed_partial" | "failed" | "failed_budget";

export type Checkpoint = "research" | "prd";

export type Revision = {
  costUsd: number;
  createdAt: string;
  feedback: string;
  finishedAt: string | null;
  n: number;
  note: string | null;
  status: "queued" | "running" | "deployed" | "failed";
};

export type Question = { default: string; id: string; options: string[]; question: string; why: string };

/** Open only while the run waits for the customer. */
export type OpenQuestions = {
  checkpoint: Checkpoint;
  /** PRD checkpoint only: what the spec contains, shown next to the questions. */
  context: {
    /** Feedback rounds only: what the updated spec changes. */
    changes?: string[] | null;
    features: { id: string; name: string }[];
    roles: string[];
    screens: { id: string; name: string }[];
  } | null;
  deadline: string;
  items: Question[];
};

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

export type Activity = { at: string; stage: string; text: string };

export type Run = {
  /** Latest agent actions, newest first; only while the run is in progress. */
  activity: Activity[];
  appUrl: string | null;
  budgetUsd: number;
  costUsd: number;
  createdAt: string;
  currentStage: string | null;
  designSystem: DesignSystem;
  id: string;
  prompt: string;
  /** 1-based position while queued, otherwise null. */
  queuePosition: number | null;
  stages: Stage[];
  questions: OpenQuestions | null;
  /** Feedback rounds on the deployed app, oldest first; the original build is round 1. */
  revisions: Revision[];
  status: RunStatus;
  stopReason: string | null;
};

export type BoardColumn = "todo" | "doing" | "built" | "verified" | "failed";

export type CardKind = "feature" | "screen" | "test" | "smoke";

export type BoardCard = {
  column: BoardColumn;
  id: string;
  kind: CardKind;
  links: string[];
  note: string;
  position: number;
  title: string;
  updatedAt: string;
};

export type BoardEvent = {
  actor: string;
  at: string;
  cardId: string;
  /** Null when the card was created. */
  from: BoardColumn | null;
  id: number;
  note: string;
  to: BoardColumn;
};

export type Board = { cards: BoardCard[]; events: BoardEvent[] };

export type Envelope<T> = { data: T; message: string; status: number; type: "list" | "object" };
