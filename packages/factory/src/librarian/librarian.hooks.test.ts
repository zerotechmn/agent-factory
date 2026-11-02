import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOOK_LIMIT_PER_SESSION } from "./librarian.constants";
import { createHookState, docHint, importLookups, lessonHint } from "./librarian.hooks";
import { indexLibrary } from "./librarian.ingest";
import { recordLessons } from "./librarian.service";

const FAILING_TAP = [
  "not ok 3 - TC-3: rejects an end date before the start",
  "  error: 'Expected 400, received 500'",
  "  at /app/workspace/test/bookings.test.js:41:7",
  "# pass 12",
  "# fail 1",
].join("\n");

beforeAll(async () => {
  recordLessons({
    designSystem: "custom",
    lessons: [
      {
        fix: "Validate the date range before inserting and return 400",
        problem: "Expected 400 but received 500 when the end date is before the start",
        rootCause: "The SQLite CHECK constraint threw before validation ran",
        step: "tests",
        tags: ["express", "sqlite"],
      },
    ],
    prompt: "A car rental marketplace for owners and renters",
    runId: "hooks00001",
  });
  const root = mkdtempSync(join(tmpdir(), "librarian-hooks-"));
  mkdirSync(join(root, "docs/antd@6"), { recursive: true });
  writeFileSync(join(root, "docs/antd@6/table.md"), "# Table\n\n## API\n\nTable props: columns, dataSource, pagination, rowKey.");
  writeFileSync(join(root, "docs/antd@6/date-picker.md"), "# DatePicker\n\n## API\n\nDatePicker props: format, disabledDate, picker.");
  await indexLibrary(root, []);
});

describe("lessonHint", () => {
  test("a failing test run gets the matching lesson, once", () => {
    const state = createHookState();
    const hint = lessonHint(state, FAILING_TAP, false);
    expect(hint?.tool).toBe("auto:hook-lessons");
    expect(hint?.text).toContain("CHECK constraint");
    expect(lessonHint(state, FAILING_TAP, false)).toBeNull();
  });

  test("a passing run gets nothing", () => {
    expect(lessonHint(createHookState(), "ok 1 - TC-1: lists cars\n# pass 1\n# fail 0", false)).toBeNull();
  });

  test("a reported failure with no matching lesson is logged but adds no text", () => {
    const hint = lessonHint(createHookState(), "Error: listen EADDRINUSE: address already in use", true);
    expect(hint).toMatchObject({ hits: 0, text: "" });
  });

  test("stops after the per-session limit", () => {
    const state = createHookState();
    state.injected = HOOK_LIMIT_PER_SESSION;
    expect(lessonHint(state, FAILING_TAP, true)).toBeNull();
  });
});

describe("importLookups", () => {
  test("one lookup per antd component or router hook, one per other module", () => {
    const code = [
      'import { Table, DatePicker as DP, type TableProps } from "antd";',
      "import { useNavigate } from 'react-router-dom';",
      'import express from "express";',
      'const Database = require("better-sqlite3");',
      'import { useState } from "react";',
    ].join("\n");
    expect(importLookups(code).map((l) => l.key)).toEqual([
      "docs:antd:Table",
      "docs:antd:DatePicker",
      "docs:antd:TableProps",
      "docs:react-router:useNavigate",
      "docs:express",
      "docs:better-sqlite3",
    ]);
  });
});

describe("docHint", () => {
  test("points at doc sections for newly imported components, never twice", () => {
    const state = createHookState();
    const hint = docHint(state, 'import { Table, DatePicker } from "antd";');
    expect(hint?.text).toContain("antd@6/table#api");
    expect(hint?.text).toContain("antd@6/date-picker#api");
    expect(docHint(state, 'import { Table } from "antd";')).toBeNull();
  });

  test("ignores files without documented imports", () => {
    expect(docHint(createHookState(), 'import { useState } from "react";')).toBeNull();
  });
});
