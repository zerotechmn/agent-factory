import { ConflictError, ValidationError } from "../lib/errors";
import * as RunsStore from "../runs/runs.store";
import * as QuestionsStore from "./questions.store";
import type { Answer, Checkpoint, CheckpointResult, PrdCheckpointContext, Question } from "./questions.types";

const POLL_MS = 2_000;

/**
 * Asks the customer between stages, never inside an agent's session: the
 * questions are stored, the run shows as waiting, and this resolves when the
 * customer answers or the deadline passes. On timeout every question gets the
 * agent's own choice, so a run nobody watches still finishes.
 */
export async function askCustomer(
  runId: string,
  {
    checkpoint,
    context = null,
    items,
    pollMs = POLL_MS,
    timeoutMs,
  }: { checkpoint: Checkpoint; context?: PrdCheckpointContext | null; items: Question[]; pollMs?: number; timeoutMs: number },
): Promise<CheckpointResult> {
  const openedAt = new Date();
  const deadline = new Date(openedAt.getTime() + timeoutMs);
  QuestionsStore.openCheckpoint(runId, { checkpoint, context, deadline: deadline.toISOString(), items: items.map(normalize), openedAt: openedAt.toISOString() });
  RunsStore.updateRun(runId, { status: "waiting_customer" });
  try {
    for (;;) {
      const state = QuestionsStore.getCheckpoint(runId, checkpoint);
      if (state?.closedAt && state.answers && state.closedBy) return { answers: state.answers, closedBy: state.closedBy, feedback: state.feedback };
      if (Date.now() >= deadline.getTime()) {
        const answers = items.map((q) => ({ answeredBy: "default" as const, id: q.id, value: normalize(q).default }));
        // The customer may have answered in the same instant; their answer wins.
        if (QuestionsStore.closeCheckpoint(runId, checkpoint, { answers, at: new Date().toISOString(), closedBy: "timeout", feedback: null })) {
          return { answers, closedBy: "timeout", feedback: null };
        }
        continue;
      }
      await Bun.sleep(pollMs);
    }
  } finally {
    RunsStore.updateRun(runId, { status: "running" });
  }
}

/**
 * The customer's answers from the portal. Unanswered questions keep the
 * agent's choice; "approve" with no answers accepts every default.
 */
export function answerCheckpoint(
  runId: string,
  checkpoint: Checkpoint,
  { answers, feedback }: { answers: { id: string; value: string }[]; feedback?: string | null },
): void {
  const state = QuestionsStore.getCheckpoint(runId, checkpoint);
  if (!state || state.closedAt) throw new ConflictError("These questions are already closed; the run has moved on.");
  const known = new Map(state.items.map((q) => [q.id, q]));
  const unknown = answers.filter((a) => !known.has(a.id)).map((a) => a.id);
  if (unknown.length) throw new ValidationError(`Unknown question ids: ${unknown.join(", ")}`, unknown);

  const given = new Map(answers.map((a) => [a.id, a.value.trim()]));
  const final: Answer[] = state.items.map((q) => {
    const value = given.get(q.id);
    return value ? { answeredBy: "customer", id: q.id, value } : { answeredBy: "default", id: q.id, value: q.default };
  });
  const text = feedback?.trim() || null;
  if (!QuestionsStore.closeCheckpoint(runId, checkpoint, { answers: final, at: new Date().toISOString(), closedBy: "customer", feedback: text })) {
    throw new ConflictError("These questions are already closed; the run has moved on.");
  }
}

/** A default must be one of the options, so the portal can preselect it. */
function normalize(q: Question): Question {
  const options = q.options.filter((o) => o.trim()).slice(0, 4);
  return { ...q, default: options.includes(q.default) ? q.default : (options[0] ?? q.default), options };
}
