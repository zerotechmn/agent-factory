import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NotFoundError } from "../lib/errors";
import * as RunsStore from "../runs/runs.store";
import { indexLibrary } from "./librarian.ingest";
import { getOverview, getRunLibrarian, recordLessons } from "./librarian.service";
import * as LibrarianStore from "./librarian.store";

const RUN = "viewrun001";
const OTHER = "viewrun002";

beforeAll(async () => {
  for (const id of [RUN, OTHER]) {
    RunsStore.insertRun({ budgetUsd: 15, designSystem: "zt", id, interactive: false, ip: "127.0.0.1", prompt: "An order approval tool" });
  }
  const root = mkdtempSync(join(tmpdir(), "librarian-views-"));
  mkdirSync(join(root, "docs/antd@6"), { recursive: true });
  writeFileSync(join(root, "docs/antd@6/table.md"), "# Table\n\n## API\n\nTable props: columns, dataSource, pagination.");
  await indexLibrary(root, []);

  recordLessons({
    designSystem: "zt",
    lessons: [{ fix: "Listen on 0.0.0.0", problem: "Container never answers health checks", rootCause: "Server bound to localhost", step: "health", tags: ["express"] }],
    prompt: "An order approval tool",
    runId: RUN,
  });
  const lessonId = LibrarianStore.topLessons("zt", 10).find((l) => l.problem.startsWith("Container never"))!.id;
  const at = "2026-11-02T10:00:00.000Z";
  LibrarianStore.logQuery({ at, hits: 1, query: "Table pagination", results: ["doc:antd@6/table#api"], runId: RUN, stage: "Development", tool: "docs_search" });
  LibrarianStore.logQuery({ at, hits: 1, query: "failure: health", results: [`lesson:${lessonId}`], runId: RUN, stage: "Fix 1", tool: "auto:lessons" });
  LibrarianStore.logQuery({ at, hits: 0, query: "secret product words of another customer", runId: OTHER, stage: "Development", tool: "lessons_search" });
  LibrarianStore.logQuery({ at, hits: 0, query: "too many", runId: RUN, stage: "Development", tool: "limit" });
});

describe("getRunLibrarian", () => {
  test("shows only this run's events, with returned items named in words", () => {
    const view = getRunLibrarian(RUN);
    expect(view.events.map((e) => e.tool)).toEqual(["docs_search", "auto:lessons", "limit"]);
    expect(view.events[0]!.results).toEqual([{ ref: "doc:antd@6/table#api", title: "antd@6 › Table › API" }]);
    expect(view.events[1]!.results[0]!.title).toBe("Container never answers health checks");
    expect(JSON.stringify(view)).not.toContain("another customer");
  });

  test("counts per stage, and the lessons this run taught", () => {
    const view = getRunLibrarian(RUN);
    expect(view.stats).toEqual([
      { auto: 0, capped: 1, pulls: 1, stage: "Development", withHits: 1 },
      { auto: 1, capped: 0, pulls: 0, stage: "Fix 1", withHits: 0 },
    ]);
    expect(view.lessonsLearned.map((l) => l.problem)).toEqual(["Container never answers health checks"]);
  });

  test("an unknown or malformed run id is not found", () => {
    expect(() => getRunLibrarian("nosuchrun1")).toThrow(NotFoundError);
    expect(() => getRunLibrarian("../etc")).toThrow(NotFoundError);
  });
});

describe("getOverview", () => {
  test("shares knowledge and counts, never queries or run ids", () => {
    const overview = getOverview();
    expect(overview.docs).toContainEqual({ library: "antd@6", sections: 1 });
    expect(overview.lessons.some((l) => l.problem === "Container never answers health checks")).toBe(true);
    expect(overview.totals.runs).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(overview);
    for (const secret of ["another customer", "Table pagination", RUN, OTHER]) expect(text).not.toContain(secret);
  });
});

describe("results column migration", () => {
  test("an old-shaped table gains the column without losing rows", () => {
    const old = new Database(":memory:");
    old.exec("CREATE TABLE library_queries (id INTEGER PRIMARY KEY, run_id TEXT, stage TEXT, tool TEXT, query TEXT, hits INTEGER, at TEXT)");
    old.exec("INSERT INTO library_queries (run_id, stage, tool, query, hits, at) VALUES ('r', 's', 't', 'q', 1, 'now')");
    // Same statement the store runs at startup.
    if (!old.query<{ name: string }, []>("PRAGMA table_info(library_queries)").all().some((c) => c.name === "results")) {
      old.exec("ALTER TABLE library_queries ADD COLUMN results TEXT NOT NULL DEFAULT '[]'");
    }
    expect(old.query<{ results: string }, []>("SELECT results FROM library_queries").get()).toEqual({ results: "[]" });
  });
});
