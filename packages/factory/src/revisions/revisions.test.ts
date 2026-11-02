import { beforeAll, describe, expect, test } from "bun:test";

import type { Prd } from "../agents/requirements/requirements.schema";
import { describePrdDiff, prdDiff } from "../agents/requirements/requirements.utils";
import * as BoardService from "../board/board.service";
import * as BoardStore from "../board/board.store";
import * as RunsService from "../runs/runs.service";
import * as RunsStore from "../runs/runs.store";
import * as RevisionsStore from "./revisions.store";

const prd = (features: { id: string; name: string }[], screens: { id: string; name: string }[] = []) =>
  ({ businessRules: [], features, screens }) as unknown as Prd;

// submitFeedback kicks the run queue. Holding the only run slot with a
// placeholder keeps the queue from starting a real revision (and agents) here.
beforeAll(() => {
  RunsStore.insertRun({ budgetUsd: 1, designSystem: "zt", id: "revslothld", interactive: false, ip: "test", prompt: "Holds the run slot" });
  RunsStore.updateRun("revslothld", { status: "running" });
});

let counter = 0;
function deployedRun(): string {
  counter += 1;
  const id = `revtest${String(counter).padStart(3, "0")}`;
  RunsStore.insertRun({ budgetUsd: 10, designSystem: "zt", id, interactive: true, ip: `rev-${id}`, prompt: "A test app" });
  RunsStore.updateRun(id, { appUrl: `http://${id}.apps.localhost`, costUsd: 4.2, status: "deployed" });
  return id;
}

describe("prdDiff", () => {
  test("finds added, changed and removed items by id, and names them", () => {
    const before = prd([{ id: "F-01", name: "Browse" }, { id: "F-02", name: "Book" }, { id: "F-03", name: "Earnings" }]);
    const after = prd([{ id: "F-01", name: "Browse" }, { id: "F-02", name: "Book with deposit" }, { id: "F-04", name: "Search" }]);
    const diff = prdDiff(before, after);
    expect(diff).toEqual({ added: ["F-04"], changed: ["F-02"], removed: ["F-03"] });
    expect(describePrdDiff(diff, before, after)).toEqual(["Added F-04: Search", "Changed F-02: Book with deposit", "Removed F-03: Earnings"]);
  });
});

describe("feedback on a deployed app", () => {
  test("starts a revision: the run goes back in the queue, numbered from round 2", () => {
    const id = deployedRun();
    expect(RunsService.submitFeedback({ body: { feedback: "Add a search box to the car list" }, id, ip: "1.2.3.4" })).toEqual({ revision: 2 });
    expect(RunsStore.getRun(id)?.status).toBe("queued");
    expect(RevisionsStore.pendingRevision(id)).toMatchObject({ feedback: "Add a search box to the car list", n: 2, status: "queued" });
  });

  test("is refused while the app isn't deployed, for too-short text, and over the round limit", () => {
    const id = deployedRun();
    expect(() => RunsService.submitFeedback({ body: { feedback: "short" }, id, ip: "1.2.3.4" })).toThrow("at least 10 characters");
    RunsService.submitFeedback({ body: { feedback: "First change to the app" }, id, ip: "1.2.3.4" });
    // Queued now: a second round must wait for the first to finish.
    expect(() => RunsService.submitFeedback({ body: { feedback: "Second change to the app" }, id, ip: "1.2.3.4" })).toThrow("once the app is deployed");

    const full = deployedRun();
    for (let i = 0; i < 5; i++) RevisionsStore.addRevision(full, `Change number ${i}`);
    expect(() => RunsService.submitFeedback({ body: { feedback: "One change too many" }, id: full, ip: "1.2.3.4" })).toThrow("maximum of 5");
  });

  test("a finished round records its cost and result", () => {
    const id = deployedRun();
    const n = RevisionsStore.addRevision(id, "Show prices in MNT");
    RevisionsStore.updateRevision(id, n, { status: "running" });
    expect(RevisionsStore.runningRevisionRuns()).toContain(id);
    RevisionsStore.updateRevision(id, n, { costUsd: 2.37, note: null, status: "deployed" });
    expect(RevisionsStore.listRevisions(id)[0]).toMatchObject({ costUsd: 2.37, n: 2, status: "deployed" });
    expect(RevisionsStore.listRevisions(id)[0]?.finishedAt).not.toBeNull();
  });
});

describe("task board in a feedback round", () => {
  test("changed features and their tests go back to To do; removed ones say so", () => {
    const id = deployedRun();
    BoardService.onRequirements(id, { features: [{ acceptanceCriteria: [{ id: "AC-F01-01" }], id: "F-01", name: "Book", screenIds: [] }, { acceptanceCriteria: [], id: "F-02", name: "Earnings", screenIds: [] }], screens: [] }, { actor: "Requirements" });
    BoardService.onTestPlan(id, { smokeChecks: [], testCases: [{ acceptanceCriterionIds: ["AC-F01-01"], id: "TC-1", title: "Books", type: "api" }] }, { features: [{ acceptanceCriteria: [{ id: "AC-F01-01" }], id: "F-01", name: "Book" }] }, { actor: "Test cases" });
    for (const card of ["F-01", "TC-1", "F-02"]) BoardStore.moveCard(id, card, "verified", { actor: "Verify", at: new Date().toISOString() });

    BoardService.onRevision(id, { added: [], changed: ["F-01"], removed: ["F-02"] }, { actor: "Feedback round 2" });
    const cards = new Map(BoardStore.listCards(id).map((c) => [c.id, c]));
    expect(cards.get("F-01")?.column).toBe("todo");
    expect(cards.get("TC-1")?.column).toBe("todo");
    expect(cards.get("F-02")).toMatchObject({ column: "verified", note: "Removed by feedback round 2" });
  });
});
