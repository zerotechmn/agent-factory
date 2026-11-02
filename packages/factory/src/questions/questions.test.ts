import { describe, expect, test } from "bun:test";

import type { PrdReview } from "../agents/prd-review/prd-review.schema";
import type { Prd } from "../agents/requirements/requirements.schema";
import { answerSchema, createRunSchema } from "../runs/runs.dto";
import { markWatched } from "../runs/runs.presence";
import * as RunsStore from "../runs/runs.store";
import { answerCheckpoint, askCustomer } from "./questions.service";
import * as QuestionsStore from "./questions.store";
import type { Question } from "./questions.types";
import { prdQuestions, renderPrdFeedback, renderResearchAnswers, researchQuestions } from "./questions.utils";

const question = (id: string, extra: Partial<Question> = {}): Question => ({
  default: "Owners only",
  id,
  options: ["Owners only", "Anyone"],
  question: "Who may list a car?",
  why: "Decides the sign-up flow",
  ...extra,
});

let counter = 0;
function newRun(): string {
  counter += 1;
  const id = `qtest${String(counter).padStart(5, "0")}`;
  RunsStore.insertRun({ budgetUsd: 10, designSystem: "zt", id, interactive: true, ip: "test", prompt: "A test app" });
  RunsStore.updateRun(id, { status: "running" });
  return id;
}

describe("askCustomer", () => {
  test("waits, shows the run as waiting, and resumes with the customer's answers", async () => {
    const runId = newRun();
    const pending = askCustomer(runId, { checkpoint: "research", items: [question("Q-1"), question("Q-2")], pollMs: 10, timeoutMs: 60_000 });
    await Bun.sleep(30);
    expect(RunsStore.getRun(runId)?.status).toBe("waiting_customer");

    answerCheckpoint(runId, "research", { answers: [{ id: "Q-1", value: "Anyone" }], feedback: "Also show prices in MNT" });
    const result = await pending;
    expect(result).toEqual({
      answers: [
        { answeredBy: "customer", id: "Q-1", value: "Anyone" },
        { answeredBy: "default", id: "Q-2", value: "Owners only" },
      ],
      closedBy: "customer",
      feedback: "Also show prices in MNT",
    });
    expect(RunsStore.getRun(runId)?.status).toBe("running");
    // The run moved on: a late answer is refused rather than silently lost.
    expect(() => answerCheckpoint(runId, "research", { answers: [] })).toThrow("already closed");
  });

  test("continues with the agent's defaults after the timeout", async () => {
    const runId = newRun();
    const result = await askCustomer(runId, { checkpoint: "prd", items: [question("OQ-01", { default: "not an option" })], pollMs: 5, timeoutMs: 30 });
    // A default outside the options is replaced by the first option, so the portal can preselect it.
    expect(result).toEqual({ answers: [{ answeredBy: "default", id: "OQ-01", value: "Owners only" }], closedBy: "timeout", feedback: null });
    expect(QuestionsStore.getCheckpoint(runId, "prd")?.closedBy).toBe("timeout");
  });

  test("rejects answers to unknown questions", async () => {
    const runId = newRun();
    const pending = askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], pollMs: 5, timeoutMs: 200 });
    await Bun.sleep(10);
    expect(() => answerCheckpoint(runId, "research", { answers: [{ id: "Q-9", value: "x" }] })).toThrow("Unknown question ids: Q-9");
    await pending;
  });
});

describe("questions to and from the agents", () => {
  const prd = {
    decisions: [
      { askCustomer: true, decision: "Owners only", id: "OQ-01", options: ["Owners only", "Anyone"], question: "Who may list a car?", rationale: "Simplest" },
      { askCustomer: false, decision: "MNT", id: "OQ-02", options: [], question: "Currency?", rationale: "Local" },
    ],
  } as unknown as Prd;
  const review: PrdReview = {
    extras: [{ id: "F-07", reason: "a referral programme" }],
    requests: [
      { coveredBy: [], note: "", quote: "an earnings summary", status: "missing" },
      { coveredBy: ["F-01"], note: "", quote: "browse cars", status: "covered" },
    ],
  };

  test("flagged decisions, gaps and extras become questions; defaults follow PRD_GATES", () => {
    const advisory = prdQuestions(prd, review, "advisory");
    expect(advisory.map((q) => [q.id, q.default])).toEqual([
      ["OQ-01", "Owners only"],
      ["GAP-1", "Leave it out"],
      ["EXTRA-1", "Keep it"],
    ]);
    expect(prdQuestions(prd, review, "repair").map((q) => q.default)).toEqual(["Owners only", "Add it to the spec", "Remove it"]);
    expect(researchQuestions({ questionsForCustomer: [question("Q-1"), question("Q-2", { options: ["only one"] })] }).map((q) => q.id)).toEqual(["Q-1"]);
  });

  test("only answers that change the spec reach the repair; untouched defaults don't", () => {
    const items = prdQuestions(prd, review, "advisory");
    const untouched = renderPrdFeedback(items, {
      answers: items.map((q) => ({ answeredBy: "default" as const, id: q.id, value: q.default })),
      closedBy: "timeout",
      feedback: null,
    });
    expect(untouched).toBeNull();

    const changed = renderPrdFeedback(items, {
      answers: [
        { answeredBy: "customer", id: "OQ-01", value: "Anyone" },
        { answeredBy: "customer", id: "GAP-1", value: "Add it to the spec" },
        { answeredBy: "customer", id: "EXTRA-1", value: "Remove it" },
      ],
      closedBy: "customer",
      feedback: "Prices in MNT",
    });
    expect(changed).toContain('OQ-01 "Who may list a car?": the customer chose "Anyone" (you had "Owners only")');
    expect(changed).toContain('The customer chose: add to the spec — You asked: "an earnings summary".');
    expect(changed).toContain("The customer chose: remove it (move to outOfScope) — The spec adds F-07");
    expect(changed).toContain("The customer wrote: Prices in MNT");
  });

  test("unanswered research questions are passed on as the researcher's suggestions", () => {
    const text = renderResearchAnswers([question("Q-1")], { answers: [{ answeredBy: "default", id: "Q-1", value: "Owners only" }], closedBy: "timeout", feedback: null });
    expect(text).toContain("didn't answer");
    expect(text).toContain("→ Owners only (no answer; the researcher's suggestion)");
  });
});

describe("API input", () => {
  test("runs are interactive unless a script says otherwise; answers are validated", () => {
    expect(createRunSchema.parse({ prompt: "A tiny notes app" }).interactive).toBe(true);
    expect(createRunSchema.parse({ interactive: false, prompt: "A tiny notes app" }).interactive).toBe(false);
    expect(answerSchema.safeParse({ answers: [{ id: "Q-1", value: " " }], checkpoint: "research" }).success).toBe(false);
    expect(answerSchema.safeParse({ checkpoint: "deploy" }).success).toBe(false);
    expect(answerSchema.parse({ checkpoint: "prd" })).toEqual({ answers: [], checkpoint: "prd" });
  });
});

describe("askCustomer when a run resumes after a restart", () => {
  test("an answered checkpoint returns the saved answers without asking again", async () => {
    const runId = newRun();
    const first = askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], pollMs: 5, timeoutMs: 60_000 });
    await Bun.sleep(15);
    answerCheckpoint(runId, "research", { answers: [{ id: "Q-1", value: "Anyone" }], feedback: null });
    await first;

    const replay = await askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], pollMs: 5, resume: true, timeoutMs: 60_000 });
    expect(replay.answers).toEqual([{ answeredBy: "customer", id: "Q-1", value: "Anyone" }]);
    expect(replay.closedBy).toBe("customer");
  });

  test("an open checkpoint keeps the deadline the customer was shown", async () => {
    const runId = newRun();
    const deadline = new Date(Date.now() + 40).toISOString();
    QuestionsStore.openCheckpoint(runId, { checkpoint: "prd", context: null, deadline, items: [question("OQ-1")], openedAt: new Date().toISOString() });

    const started = Date.now();
    const result = await askCustomer(runId, { checkpoint: "prd", items: [question("OQ-1")], pollMs: 5, resume: true, timeoutMs: 60_000 });
    expect(result.closedBy).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(QuestionsStore.getCheckpoint(runId, "prd")?.deadline).toBe(deadline);
  });
});

describe("waiting only while someone watches", () => {
  const watch = { leaveMs: 60, startMs: 50 };

  test("nobody has the build open: no wait at all, the agents' choices are used", async () => {
    const runId = newRun();
    const started = Date.now();
    const result = await askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], onlyWhileWatched: watch, pollMs: 5, timeoutMs: 60_000 });
    expect(Date.now() - started).toBeLessThan(100);
    expect(result).toMatchObject({ answers: [{ answeredBy: "default", id: "Q-1" }], closedBy: "timeout" });
    expect(RunsStore.getRun(runId)?.status).toBe("running");
  });

  test("someone watching gets asked; when they leave, the run stops waiting", async () => {
    const runId = newRun();
    markWatched(runId);
    const pending = askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], onlyWhileWatched: watch, pollMs: 5, timeoutMs: 60_000 });
    await Bun.sleep(20);
    expect(RunsStore.getRun(runId)?.status).toBe("waiting_customer");
    // No more polls from the page: after leaveMs the wait ends with the defaults.
    const result = await pending;
    expect(result.closedBy).toBe("timeout");
  });

  test("a watcher who keeps the page open can still answer", async () => {
    const runId = newRun();
    markWatched(runId);
    const keepWatching = setInterval(() => markWatched(runId), 10);
    const pending = askCustomer(runId, { checkpoint: "research", items: [question("Q-1")], onlyWhileWatched: watch, pollMs: 5, timeoutMs: 60_000 });
    await Bun.sleep(100);
    answerCheckpoint(runId, "research", { answers: [{ id: "Q-1", value: "Anyone" }] });
    expect((await pending).closedBy).toBe("customer");
    clearInterval(keepWatching);
  });
});
