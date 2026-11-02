/** research: questions before the spec is written · prd: review of the written spec. */
export const CHECKPOINTS = ["research", "prd"] as const;

export type Checkpoint = (typeof CHECKPOINTS)[number];

export type Question = {
  /** The agent's own choice, used when the customer doesn't answer. Always one of the options. */
  default: string;
  id: string;
  options: string[];
  question: string;
  why: string;
};

export type Answer = { answeredBy: "customer" | "default"; id: string; value: string };

/** What the portal shows next to the questions at the PRD checkpoint. */
export type PrdCheckpointContext = {
  /** Feedback rounds only: what the updated spec changes, for the customer to confirm. */
  changes?: string[] | null;
  features: { id: string; name: string }[];
  roles: string[];
  screens: { id: string; name: string }[];
};

export type CheckpointState = {
  answers: Answer[] | null;
  checkpoint: Checkpoint;
  closedAt: string | null;
  closedBy: "customer" | "timeout" | null;
  context: PrdCheckpointContext | null;
  deadline: string;
  feedback: string | null;
  items: Question[];
  openedAt: string;
};

export type CheckpointResult = { answers: Answer[]; closedBy: "customer" | "timeout"; feedback: string | null };
