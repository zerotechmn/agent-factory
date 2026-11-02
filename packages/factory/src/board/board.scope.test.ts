import { describe, expect, test } from "bun:test";

import * as RunsStore from "../runs/runs.store";
import * as BoardStore from "./board.store";
import { onDevelopmentDone, scopeFromLabel } from "./board.service";

const run = "boardscope";

function seed() {
  RunsStore.insertRun({ budgetUsd: 15, designSystem: "zt", id: run, interactive: false, ip: "t", prompt: "x" });
  BoardStore.seedCards(
    run,
    [
      { id: "F-01", kind: "feature", links: ["S-01"], note: "", title: "Orders" },
      { id: "F-02", kind: "feature", links: ["S-02"], note: "", title: "Approvals" },
      { id: "S-01", kind: "screen", links: ["F-01"], note: "", title: "Order list" },
      { id: "S-02", kind: "screen", links: ["F-02"], note: "", title: "Approval" },
      { id: "TC-1", kind: "test", links: ["F-01"], note: "", title: "lists orders" },
      { id: "TC-2", kind: "test", links: ["F-02"], note: "", title: "approves" },
    ],
    { actor: "test", at: "2026-11-03T00:00:00.000Z" },
  );
}

const column = (id: string) => BoardStore.listCards(run).find((c) => c.id === id)?.column;

describe("onDevelopmentDone with a scope", () => {
  test("a feature group's session moves only its own feature, screen and tests", () => {
    seed();
    onDevelopmentDone(run, { screens: [{ path: "/orders", screenId: "S-01" }], testsWritten: ["TC-1"] }, { actor: "Development (F-01)" }, ["F-01"]);
    expect([column("F-01"), column("S-01"), column("TC-1")]).toEqual(["built", "built", "built"]);
    expect([column("F-02"), column("S-02"), column("TC-2")]).toEqual(["todo", "todo", "todo"]);
  });

  test("scaffold and finish move no feature", () => {
    onDevelopmentDone(run, { screens: [{ path: "/approvals", screenId: "S-02" }], testsWritten: [] }, { actor: "Development (finish)" }, "none");
    expect(column("S-02")).toBe("built");
    expect(column("F-02")).toBe("todo");
  });
});

describe("scopeFromLabel", () => {
  test("reads the part from the stage label", () => {
    expect(scopeFromLabel("Development (F-02+F-03)")).toEqual(["F-02", "F-03"]);
    expect(scopeFromLabel("Development (scaffold)")).toBe("none");
    expect(scopeFromLabel("Development (finish)")).toBe("none");
    expect(scopeFromLabel("Development")).toBeUndefined();
    expect(scopeFromLabel("Development (r1)")).toBeUndefined();
  });
});
