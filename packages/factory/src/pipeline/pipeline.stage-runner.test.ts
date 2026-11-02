import { describe, expect, test } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { StructuredOutputTracker } from "./pipeline.stage-runner";

// Shapes taken from run br5ruyu6tp's UI/UX transcript, where the answer was
// accepted and the budget stop arrived one message later.
const assistantCall = (id: string, input: unknown) =>
  ({ message: { content: [{ id, input, name: "StructuredOutput", type: "tool_use" }], id: `msg-${id}` }, type: "assistant" }) as unknown as SDKMessage;
const toolResult = (id: string, isError: boolean, text: string) =>
  ({ message: { content: [{ content: text, is_error: isError, tool_use_id: id, type: "tool_result" }], role: "user" }, type: "user" }) as unknown as SDKMessage;

describe("StructuredOutputTracker", () => {
  test("keeps an answer the SDK accepted", () => {
    const tracker = new StructuredOutputTracker();
    tracker.observe(assistantCall("t1", { concept: "Kerbside" }));
    tracker.observe(toolResult("t1", false, "Structured output provided successfully"));
    expect(tracker.accepted).toEqual({ concept: "Kerbside" });
  });

  test("ignores a submission the SDK rejected, and an unanswered one", () => {
    const tracker = new StructuredOutputTracker();
    tracker.observe(assistantCall("t1", { bad: true }));
    tracker.observe(toolResult("t1", true, "Output does not match schema"));
    tracker.observe(assistantCall("t2", { pending: true }));
    expect(tracker.accepted).toBeUndefined();
  });

  test("the latest accepted answer wins, and other tools' results don't count", () => {
    const tracker = new StructuredOutputTracker();
    tracker.observe(assistantCall("t1", { v: 1 }));
    tracker.observe(toolResult("t1", false, "ok"));
    tracker.observe(toolResult("other", false, "Launching skill"));
    tracker.observe(assistantCall("t2", { v: 2 }));
    tracker.observe(toolResult("t2", false, "ok"));
    expect(tracker.accepted).toEqual({ v: 2 });
  });
});
