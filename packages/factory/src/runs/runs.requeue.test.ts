import { describe, expect, test } from "bun:test";

import * as RunsStore from "./runs.store";

function run(id: string, status: "running" | "waiting_customer" | "deployed") {
  RunsStore.insertRun({ budgetUsd: 15, designSystem: "zt", id, interactive: true, ip: "test", prompt: "A test app" });
  RunsStore.updateRun(id, { status });
  RunsStore.startStage(id, { dirName: "01-research", label: "Research", seq: 1, stageKey: "research" });
}

describe("requeueInterruptedRuns", () => {
  test("puts interrupted runs back in the queue and marks their running steps interrupted", () => {
    run("requeue001", "running");
    run("requeue002", "waiting_customer");
    run("requeue003", "deployed");
    const result = RunsStore.requeueInterruptedRuns({ exclude: [], maxResumes: 2 });
    expect(result.requeued).toEqual(expect.arrayContaining(["requeue001", "requeue002"]));
    expect(result.requeued).not.toContain("requeue003");
    expect(RunsStore.getRun("requeue001")).toMatchObject({ status: "queued", stopReason: "Resuming after a factory restart" });
    expect(RunsStore.listStages("requeue001")[0]).toMatchObject({ error: "Interrupted by restart", status: "failed" });
  });

  test("gives up on a run after the resume limit instead of looping", () => {
    run("requeue004", "running");
    for (let i = 0; i < 2; i++) {
      expect(RunsStore.requeueInterruptedRuns({ exclude: [], maxResumes: 2 }).requeued).toContain("requeue004");
      RunsStore.updateRun("requeue004", { status: "running" });
    }
    expect(RunsStore.requeueInterruptedRuns({ exclude: [], maxResumes: 2 }).failed).toContain("requeue004");
    expect(RunsStore.getRun("requeue004")?.status).toBe("failed");
  });

  test("leaves excluded runs (feedback rounds) alone", () => {
    run("requeue005", "running");
    expect(RunsStore.requeueInterruptedRuns({ exclude: ["requeue005"], maxResumes: 2 }).requeued).not.toContain("requeue005");
    expect(RunsStore.getRun("requeue005")?.status).toBe("running");
  });
});
