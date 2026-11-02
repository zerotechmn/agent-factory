import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, test } from "bun:test";

import * as BoardService from "../board/board.service";
import * as BoardStore from "../board/board.store";
import { parseTestCounts } from "../board/board.utils";
import { activityObserver, describeCommand, describeToolUse, recentActivity, summarizeTestRun } from "./pipeline.activity";

describe("describeToolUse", () => {
  test("says what an agent is doing in plain words", () => {
    expect(describeToolUse("Write", { file_path: "/ws/src/app.ts" }, "/ws")).toBe("Writing src/app.ts");
    expect(describeToolUse("Skill", { skill: "factory:test-driven-development" }, "/ws")).toBe("Loading the test-driven-development skill");
    expect(describeToolUse("Bash", { command: "npm ci", description: "install dependencies" }, "/ws")).toBe("Install dependencies");
    expect(describeToolUse("Bash", { command: "npm test 2>&1 | tail -40" }, "/ws")).toBe("Running the tests");
    expect(describeToolUse("mcp__browser__browser_check", { paths: ["/", "/a"], port: 3000 }, "/ws")).toBe("Checking 2 screens in a browser");
  });

  test("describes heredoc writes and chained commands", () => {
    expect(describeCommand("cat > test/pricing.test.js <<'EOF'\nx\nEOF\nnode --test test/", "")).toBe(
      "Writing test/pricing.test.js, then running the tests",
    );
    expect(describeCommand("(npm ci || npm install) 2>&1 | tail -1 && npm test 2>&1 | grep pass", "")).toBe(
      "Installing dependencies, then running the tests",
    );
    expect(describeCommand("ls -la && node -v", "")).toBe("Looking through the workspace");
  });

  test("reads totals when output is cut down to counts", () => {
    expect(parseTestCounts("# tests 13\n# pass 6\n# fail 7")).toEqual({ failed: 7, passed: 6 });
    expect(parseTestCounts(" 54 pass\n 0 fail\n")).toEqual({ failed: 0, passed: 54 });
    expect(parseTestCounts("Tests:       2 failed, 10 passed, 12 total")).toEqual({ failed: 2, passed: 10 });
    expect(parseTestCounts("===== 5 passed, 1 failed in 0.3s =====")).toEqual({ failed: 1, passed: 5 });
    expect(parseTestCounts("found 0 vulnerabilities")).toBeNull();
    expect(summarizeTestRun("# tests 13\n# pass 6\n# fail 7")).toBe("Test run: 6 passing, 7 failing");
  });

  test("summarizes a test run only when the output names test cases", () => {
    expect(summarizeTestRun("ok 1 - TC-1: a\nnot ok 2 - TC-2: b\nok 3 - TC-3: c")).toBe("Test run: 2 passing, 1 failing");
    expect(summarizeTestRun("added 120 packages in 3s")).toBeNull();
  });
});

describe("live progress from the developer's stream", () => {
  const runId = "obsrvtest1";
  const assistant = (blocks: unknown[]) => ({ message: { content: blocks, id: crypto.randomUUID() }, type: "assistant" }) as unknown as SDKMessage;
  const toolResult = (id: string, text: string) =>
    ({ message: { content: [{ content: text, tool_use_id: id, type: "tool_result" }] }, type: "user" }) as unknown as SDKMessage;

  test("writing a test, then the developer's own test run, moves cards with no agent cooperation", () => {
    // Totals-only output (grep'd to counts) still proves the written tests pass when nothing fails.
    BoardService.onRequirements(
      runId,
      { features: [{ acceptanceCriteria: [{ id: "AC-F01-01" }], id: "F-01", name: "Book", screenIds: [] }], screens: [] },
      { actor: "Requirements" },
    );
    BoardService.onTestPlan(
      runId,
      { smokeChecks: [], testCases: [{ acceptanceCriterionIds: ["AC-F01-01"], id: "TC-1", title: "Books", type: "api" }] },
      { features: [{ acceptanceCriteria: [{ id: "AC-F01-01" }], id: "F-01", name: "Book" }] },
      { actor: "Test cases" },
    );
    const board = BoardService.developerObserver(runId, { actor: "Development" });
    const activity = activityObserver({ cwd: "/ws", runId, stage: "Development" });
    const feed = (m: SDKMessage) => {
      board(m);
      activity(m);
    };
    const column = (id: string) => BoardStore.listCards(runId).find((c) => c.id === id)?.column;

    feed(assistant([{ id: "w1", input: { content: "test('TC-1: books', () => {})", file_path: "/ws/test/api.test.js" }, name: "Write", type: "tool_use" }]));
    expect(column("TC-1")).toBe("doing");
    expect(column("F-01")).toBe("doing");

    feed(assistant([{ id: "b1", input: { command: "npm test" }, name: "Bash", type: "tool_use" }]));
    feed(toolResult("b1", "# tests 1\n# pass 1\n# fail 0"));
    expect(column("TC-1")).toBe("built");
    expect(column("F-01")).toBe("built");

    expect(recentActivity(runId).map((a) => a.text)).toEqual(["Test run: 1 passing", "Running the tests", "Writing test/api.test.js"]);
  });
});
