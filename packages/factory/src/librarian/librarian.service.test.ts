import { describe, expect, test } from "bun:test";

import {
  cleanLesson,
  clip,
  errorLines,
  failureQuery,
  ftsQuery,
  lessonsForFailure,
  rankedLessons,
  stackTags,
  lessonSignature,
  quotesPrompt,
  recordLessons,
  searchLessons,
  settleLessons,
  topLessons,
  type PendingLesson,
} from "./librarian.service";

const lesson = (overrides: Partial<PendingLesson> = {}): PendingLesson => ({
  fix: "Removed the global rule and set min-width: 0 on flex children",
  problem: "Words split mid-word on every screen",
  reportedBy: "Fix 1",
  rootCause: "overflow-wrap: anywhere on body",
  step: "ui",
  tags: ["css"],
  ...overrides,
});

describe("ftsQuery", () => {
  test("quotes words so punctuation is never FTS syntax", () => {
    expect(ftsQuery('antd Table: "pagination"?')).toBe('"antd"* OR "table"* OR "pagination"*');
    expect(ftsQuery("a ? !")).toBeNull();
  });
});

describe("clip", () => {
  test("cuts long results and says so", () => {
    expect(clip("short", 100)).toBe("short");
    const cut = clip("x".repeat(500), 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut).toContain("cut at 100");
  });
});

describe("settleLessons", () => {
  test("a lesson is proven when its step passes and dropped when it still fails", () => {
    const ui = lesson();
    const tests = lesson({ step: "tests" });
    const { keep, proven } = settleLessons([ui, tests], { gate: { failedSteps: ["tests"], mode: "full" }, reviewOk: null });
    expect(proven).toEqual([ui]);
    expect(keep).toEqual([]);
  });

  test("a container-only verify can't judge test or browser lessons", () => {
    const ui = lesson();
    const build = lesson({ step: "build" });
    const { keep, proven } = settleLessons([ui, build], { gate: { failedSteps: [], mode: "container" }, reviewOk: null });
    expect(proven).toEqual([build]);
    expect(keep).toEqual([ui]);
  });

  test("review lessons wait for a review", () => {
    const review = lesson({ step: "review" });
    expect(settleLessons([review], { gate: { failedSteps: [], mode: "full" }, reviewOk: null }).keep).toEqual([review]);
    expect(settleLessons([review], { gate: null, reviewOk: true }).proven).toEqual([review]);
    expect(settleLessons([review], { gate: null, reviewOk: false })).toEqual({ keep: [], proven: [] });
  });
});

describe("quotesPrompt", () => {
  const prompt = "Build a booking app for the Ulaanbaatar dental clinic with SMS reminders";

  test("flags lessons that copy the user's wording", () => {
    expect(quotesPrompt(lesson({ problem: "the ulaanbaatar dental clinic with sms reminders broke" }), prompt)).toBe(true);
  });

  test("allows general engineering lessons", () => {
    expect(quotesPrompt(lesson(), prompt)).toBe(false);
    expect(quotesPrompt(lesson(), "tiny")).toBe(false);
  });
});

describe("cleanLesson and lessonSignature", () => {
  test("normalises whitespace, tags and length", () => {
    const cleaned = cleanLesson(lesson({ problem: `  Words   split\n${"x".repeat(1_000)}`, tags: ["CSS", "css", " antd "] }));
    expect(cleaned.problem.startsWith("Words split x")).toBe(true);
    expect(cleaned.problem.length).toBe(600);
    expect(cleaned.tags).toEqual(["css", "antd"]);
  });

  test("the same problem worded with different punctuation has one signature", () => {
    expect(lessonSignature(lesson({ problem: "Words split mid-word, on every screen!" }))).toBe(lessonSignature(lesson()));
  });
});

describe("recordLessons", () => {
  test("stores proven lessons, counts repeats once per run, and finds them again", () => {
    const prompt = "A small inventory tracker for a hardware shop";
    expect(recordLessons({ designSystem: "zt", lessons: [lesson()], prompt, runId: "run0000001" })).toBe(1);
    recordLessons({ designSystem: "zt", lessons: [lesson()], prompt, runId: "run0000001" });
    recordLessons({ designSystem: "zt", lessons: [lesson()], prompt, runId: "run0000002" });
    recordLessons({ designSystem: "zt", lessons: [lesson({ problem: "Health check timed out", step: "health" })], prompt, runId: "run0000002" });

    const found = searchLessons("text breaks mid word overflow");
    expect(found[0]).toMatchObject({ problem: "Words split mid-word on every screen", seen: 2 });
    // Other test files share this database, so look only at this test's lessons.
    const mine = topLessons("zt").filter((l) => ["Words split mid-word on every screen", "Health check timed out"].includes(l.problem));
    expect(mine.map((l) => l.seen)).toEqual([2, 1]);
    expect(topLessons("custom").some((l) => l.problem === "Health check timed out")).toBe(false);
  });

  test("skips lessons without a problem or fix, or that quote the prompt", () => {
    const prompt = "Build a booking app for the Ulaanbaatar dental clinic";
    const lessons = [lesson({ fix: " " }), lesson({ problem: "booking app for the ulaanbaatar dental clinic crashed" })];
    expect(recordLessons({ designSystem: "custom", lessons, prompt, runId: "run0000003" })).toBe(0);
  });
});

describe("stackTags", () => {
  test("finds the stack's technologies in lesson-tag vocabulary", () => {
    const architecture = {
      stack: {
        backend: "Express 4 on Node.js 22 with better-sqlite3",
        frontend: "React 18 + antd@6 + react-router-dom 6, built by Vite",
        testFramework: "vitest + supertest",
      },
    };
    expect(stackTags(architecture)).toEqual(["better-sqlite3", "react-router", "supertest", "express", "vitest", "react", "antd", "vite", "node"]);
    expect(stackTags(null)).toEqual([]);
  });
});

describe("errorLines and failureQuery", () => {
  test("keeps what went wrong and drops what is unique to this app", () => {
    const log = ["> app@1.0.0 test", "not ok 3 - TC-3: rejects 'bad' input", "    at /app/server/bookings.js:41:7", "Error: expected 400 got 500"].join("\n");
    expect(errorLines(log)).toEqual(["not ok - TC- : rejects input", "Error: expected got"]);
  });

  test("names the failed steps first, then their log lines", () => {
    const gate = { failedSteps: ["build" as const], logs: { build: "#12 ERROR: failed to solve: npm ci exited with code 1" } };
    expect(failureQuery(gate)).toBe("build # ERROR: failed to solve: npm ci exited with code");
  });
});

describe("rankedLessons and lessonsForFailure", () => {
  const prompt = "An equipment rental desk for a sports club";
  test("lessons tagged with the run's stack come first", () => {
    recordLessons({ designSystem: "custom", lessons: [lesson({ problem: "Generic flaky timer test", step: "tests", tags: ["timers"] })], prompt, runId: "rank000001" });
    recordLessons({ designSystem: "custom", lessons: [lesson({ problem: "Generic flaky timer test", step: "tests", tags: ["timers"] })], prompt, runId: "rank000002" });
    recordLessons({ designSystem: "custom", lessons: [lesson({ problem: "Vite build output not served by Express", step: "health", tags: ["vite", "express"] })], prompt, runId: "rank000001" });
    const ranked = rankedLessons({ designSystem: "custom", tags: ["express", "vite"] });
    expect(ranked[0]?.problem).toBe("Vite build output not served by Express");
    expect(rankedLessons({ designSystem: "custom", steps: ["tests"], tags: [] }).map((l) => l.step)).toEqual(["tests"]);
  });

  test("only lessons about a failing check qualify", () => {
    recordLessons({ designSystem: "custom", lessons: [lesson({ problem: "Container exits because the server binds to localhost", step: "health", tags: ["docker"] })], prompt, runId: "fail000001" });
    const healthGate = { failedSteps: ["health" as const], logs: { health: "server listening on localhost, connection refused" } };
    expect(lessonsForFailure({ gate: healthGate }).map((l) => l.step)).toContain("health");
    const testGate = { failedSteps: ["tests" as const], logs: { tests: "server listening on localhost, connection refused" } };
    expect(lessonsForFailure({ gate: testGate }).every((l) => l.step === "tests")).toBe(true);
    expect(lessonsForFailure({ gate: null })).toEqual([]);
  });
});
