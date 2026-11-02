import { describe, expect, test } from "bun:test";

import * as BoardService from "../board/board.service";
import * as BoardStore from "../board/board.store";
import { isCancelled, registerRun, RunCancelledError, unregisterRun } from "../pipeline/pipeline.cancel";
import { askCustomer } from "../questions/questions.service";
import * as QuestionsStore from "../questions/questions.store";
import * as RevisionsStore from "../revisions/revisions.store";
import * as RunsService from "./runs.service";
import * as RunsStore from "./runs.store";

let counter = 0;
function newRun(status: "queued" | "running" | "deployed" | "failed"): string {
  counter += 1;
  const id = `cncltest${String(counter).padStart(2, "0")}`;
  RunsStore.insertRun({ budgetUsd: 10, designSystem: "zt", id, interactive: true, ip: "test", prompt: "A test app" });
  RunsStore.updateRun(id, { status });
  return id;
}

describe("cancel", () => {
  test("a queued build is cancelled at once and never starts", () => {
    const id = newRun("queued");
    expect(RunsService.cancelRun(id)).toEqual({ cancelled: true });
    expect(RunsStore.getRun(id)).toMatchObject({ status: "cancelled", stopReason: "Cancelled by the user before it started" });
    // Not queued any more, so the worker can't pick it up.
    expect(RunsStore.claimNextQueuedRun()?.id).not.toBe(id);
  });

  test("a queued feedback round is dropped and the app stays as it was", () => {
    const id = newRun("deployed");
    const n = RevisionsStore.addRevision(id, "Add a search box");
    RunsStore.updateRun(id, { status: "queued" });
    RunsService.cancelRun(id);
    expect(RunsStore.getRun(id)?.status).toBe("deployed");
    expect(RevisionsStore.listRevisions(id).find((r) => r.n === n)).toMatchObject({ note: "Cancelled by the user", status: "failed" });
  });

  test("a running build is signalled; a waiting one stops waiting at once", async () => {
    const id = newRun("running");
    registerRun(id);
    const waiting = askCustomer(id, { checkpoint: "research", items: [{ default: "A", id: "Q-1", options: ["A", "B"], question: "?", why: "" }], pollMs: 5, timeoutMs: 60_000 });
    await Bun.sleep(20);
    expect(RunsService.cancelRun(id)).toEqual({ cancelled: true });
    expect(isCancelled(id)).toBe(true);
    await expect(waiting).rejects.toBeInstanceOf(RunCancelledError);
    unregisterRun(id);
  });

  test("a finished build can't be cancelled; a stale running one without a pipeline is marked cancelled", () => {
    expect(() => RunsService.cancelRun(newRun("deployed"))).toThrow("already finished");
    const stale = newRun("running");
    RunsService.cancelRun(stale);
    expect(RunsStore.getRun(stale)?.status).toBe("cancelled");
  });
});

describe("delete", () => {
  test("refuses a build that is still active", async () => {
    await expect(RunsService.deleteRun(newRun("running"))).rejects.toThrow("Only a finished build");
  });

  test("removes the run's rows from every table at once", () => {
    const id = newRun("failed");
    RunsStore.startStage(id, { dirName: "01-research", label: "Research", seq: 1, stageKey: "research" });
    BoardService.onRequirements(id, { features: [{ acceptanceCriteria: [], id: "F-01", name: "Book", screenIds: [] }], screens: [] }, { actor: "Requirements" });
    QuestionsStore.openCheckpoint(id, { checkpoint: "prd", context: null, deadline: new Date().toISOString(), items: [], openedAt: new Date().toISOString() });
    RevisionsStore.addRevision(id, "A change to the app");

    RunsService.deleteRunRecords(id);
    expect(RunsStore.getRun(id)).toBeNull();
    expect(RunsStore.listStages(id)).toEqual([]);
    expect(BoardStore.listCards(id)).toEqual([]);
    expect(QuestionsStore.listCheckpoints(id)).toEqual([]);
    expect(RevisionsStore.listRevisions(id)).toEqual([]);
  });
});
