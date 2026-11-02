import type { PrdReview } from "../agents/prd-review/prd-review.schema";
import type { Prd } from "../agents/requirements/requirements.schema";
import type { CheckpointResult, PrdCheckpointContext, Question } from "./questions.types";

const ADD = "Add it to the spec";
const LEAVE_OUT = "Leave it out";
const KEEP = "Keep it";
const REMOVE = "Remove it";

/** The researcher's questions, as asked; empty when it had none. */
export function researchQuestions(research: unknown): Question[] {
  const items = (research as { questionsForCustomer?: Question[] } | null)?.questionsForCustomer ?? [];
  return items.filter((q) => q.question?.trim() && q.options?.length >= 2).slice(0, 4);
}

/**
 * The PRD checkpoint: decisions the agent flagged for the customer, plus the
 * PRD check's gaps and unrequested features. Without an answer, gaps and
 * extras follow PRD_GATES: "repair" acts on them, "advisory" leaves the spec as is.
 */
export function prdQuestions(prd: Prd, review: PrdReview | null, prdGates: "advisory" | "repair"): Question[] {
  const decisions = prd.decisions
    .filter((d) => d.askCustomer && (d.options?.length ?? 0) >= 2)
    .slice(0, 5)
    .map((d) => ({ default: d.decision, id: d.id, options: d.options, question: d.question, why: d.rationale }));
  const gaps = (review?.requests ?? [])
    .filter((r) => r.status === "missing" || r.status === "partial")
    .map((r, i) => ({
      default: prdGates === "repair" ? ADD : LEAVE_OUT,
      id: `GAP-${i + 1}`,
      options: [ADD, LEAVE_OUT],
      question: `You asked: "${r.quote}". ${r.status === "missing" ? "The spec doesn't cover this yet." : `The spec covers it only partly${r.note ? `: ${r.note}` : ""}.`}`,
      why: "Found by the independent PRD check",
    }));
  const extras = (review?.extras ?? []).map((e, i) => ({
    default: prdGates === "repair" ? REMOVE : KEEP,
    id: `EXTRA-${i + 1}`,
    options: [KEEP, REMOVE],
    question: `The spec adds ${e.id}, which you didn't ask for: ${e.reason}`,
    why: "Found by the independent PRD check",
  }));
  return [...decisions, ...gaps, ...extras];
}

export function prdContext(prd: Prd): PrdCheckpointContext {
  return {
    features: prd.features.map((f) => ({ id: f.id, name: f.name })),
    roles: prd.roles.map((r) => r.name),
    screens: prd.screens.map((s) => ({ id: s.id, name: s.name })),
  };
}

/** The customer's answers before the spec, for the requirements prompt. */
export function renderResearchAnswers(items: Question[], result: CheckpointResult): string {
  const byId = new Map(result.answers.map((a) => [a.id, a]));
  const lines = items.map((q) => {
    const a = byId.get(q.id);
    return `- ${q.question}\n  → ${a?.value ?? q.default}${a?.answeredBy === "customer" ? "" : " (no answer; the researcher's suggestion)"}`;
  });
  const heading = result.closedBy === "customer" ? "## The customer answered (these win over research and your own guesses)" : "## Open questions the customer didn't answer (use these suggestions)";
  return `${heading}\n\n${lines.join("\n")}${result.feedback ? `\n\nThe customer added: ${result.feedback}` : ""}`;
}

/**
 * What the PRD repair must change after the checkpoint, or null when nothing:
 * decisions the customer changed, gaps to add, extras to remove, and their
 * free-text changes. Defaults that leave the spec as it is produce nothing.
 */
export function renderPrdFeedback(items: Question[], result: CheckpointResult): string | null {
  const byId = new Map(result.answers.map((a) => [a.id, a]));
  const lines: string[] = [];
  for (const q of items) {
    const a = byId.get(q.id);
    if (!a) continue;
    const who = a.answeredBy === "customer" ? "The customer chose" : "No answer; by default";
    if (q.id.startsWith("GAP-") && a.value === ADD) lines.push(`${who}: add to the spec — ${q.question}`);
    else if (q.id.startsWith("GAP-") && a.value === LEAVE_OUT && a.answeredBy === "customer") lines.push(`The customer chose to leave this out (record it in outOfScope) — ${q.question}`);
    else if (q.id.startsWith("EXTRA-") && a.value === REMOVE) lines.push(`${who}: remove it (move to outOfScope) — ${q.question}`);
    else if (!q.id.startsWith("GAP-") && !q.id.startsWith("EXTRA-") && a.answeredBy === "customer" && a.value !== q.default) {
      lines.push(`${q.id} "${q.question}": the customer chose "${a.value}" (you had "${q.default}")`);
    }
  }
  if (result.feedback) lines.push(`The customer wrote: ${result.feedback}`);
  return lines.length ? `## Customer feedback on the spec\n\n${lines.map((l) => `- ${l}`).join("\n")}` : null;
}
