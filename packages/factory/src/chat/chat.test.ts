import { describe, expect, test } from "bun:test";

import { config } from "../lib/config";
import { NotFoundError, TooManyRequestsError, ValidationError } from "../lib/errors";
import * as RunsService from "../runs/runs.service";
import * as RunsStore from "../runs/runs.store";
import { CHAT_MAX_MESSAGE_CHARS, CHAT_MAX_REPORT_CHARS } from "./chat.constants";
import { chatRequestSchema, type ChatUIMessage } from "./chat.dto";
import * as ChatService from "./chat.service";
import * as ChatStore from "./chat.store";
import { buildRunRecord, costUsd, toApiMessages } from "./chat.utils";

const msg = (role: ChatUIMessage["role"], text: string, id = crypto.randomUUID()): ChatUIMessage => ({
  id,
  parts: [{ type: "step-start" }, { text, type: "text" }],
  role,
});

let counter = 0;
function chatRun(): string {
  counter += 1;
  const id = `chattest${String(counter).padStart(2, "0")}`;
  RunsStore.insertRun({ budgetUsd: 15, designSystem: "zt", id, interactive: true, ip: "chat-test", prompt: "A habit tracker" });
  return id;
}

describe("toApiMessages", () => {
  test("keeps text, drops stopped-empty answers and anything before the first question", () => {
    const messages = [msg("assistant", "Hi"), msg("user", "What was built?"), msg("assistant", "  "), msg("user", "Hello?")];
    expect(toApiMessages(messages)).toEqual([
      { content: "What was built?", role: "user" },
      { content: "Hello?", role: "user" },
    ]);
  });
});

describe("chatRequestSchema", () => {
  test("needs the conversation to end with a question", () => {
    expect(chatRequestSchema.safeParse({ messages: [msg("user", "Why?"), msg("assistant", "Because")] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [msg("user", "   ")] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [msg("user", "Why?")] }).success).toBe(true);
  });

  test("rejects an overlong question", () => {
    expect(chatRequestSchema.safeParse({ messages: [msg("user", "x".repeat(CHAT_MAX_MESSAGE_CHARS + 1))] }).success).toBe(false);
  });
});

describe("buildRunRecord", () => {
  test("names each stage's report and says where an oversized one was cut", () => {
    const run = RunsService.getRunDetail(chatRun());
    const stages = [
      { costUsd: 0.5, dirName: "01-research", error: null, finishedAt: null, label: "Research", seq: 1, stageKey: "research", startedAt: "", status: "succeeded" },
      { costUsd: 0, dirName: "02-requirements", error: "Timed out", finishedAt: null, label: "Spec", seq: 2, stageKey: "requirements", startedAt: "", status: "failed" },
    ] as typeof run.stages;
    const record = buildRunRecord({ ...run, stages }, [
      { dirName: "01-research", markdown: "r".repeat(CHAT_MAX_REPORT_CHARS + 10) },
      { dirName: "02-requirements", markdown: null },
    ]);
    expect(record).toContain("<request>\nA habit tracker\n</request>");
    expect(record).toContain("- Spec (02-requirements): failed, $0.00. Error: Timed out");
    expect(record).toContain('<stage_report stage="Research">');
    expect(record).toContain("[Report cut here");
    expect(record).toContain('<stage_report stage="Spec">No report written.</stage_report>');
  });
});

describe("costUsd", () => {
  test("prices cache reads and writes apart from plain input", () => {
    const usage = { cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(costUsd("claude-opus-5-5", usage)).toBeCloseTo(4 + 20 + 5 + 0.2);
    expect(costUsd("some-future-model", { input_tokens: 1_000_000 })).toBe(10);
  });
});

describe("streamAnswer refuses before calling the model", () => {
  const signal = new AbortController().signal;

  test("for an unknown run", async () => {
    await expect(ChatService.streamAnswer({ body: {}, id: "nosuchrun0", ip: "chat-a", signal })).rejects.toBeInstanceOf(NotFoundError);
  });

  test("for a request that doesn't end with a question", async () => {
    const body = { messages: [msg("assistant", "Hi")] };
    await expect(ChatService.streamAnswer({ body, id: chatRun(), ip: "chat-b", signal })).rejects.toBeInstanceOf(ValidationError);
  });

  test("once the IP has used its daily questions", async () => {
    const id = chatRun();
    for (let i = 0; i < config.CHAT_MESSAGES_PER_IP_PER_DAY; i++) ChatStore.recordUsage({ costUsd: 0, ip: "chat-c", runId: id });
    const body = { messages: [msg("user", "What was built?")] };
    await expect(ChatService.streamAnswer({ body, id, ip: "chat-c", signal })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  test("and chat spend counts against the daily cap", () => {
    const before = RunsService.committedSpendTodayUsd();
    ChatStore.recordUsage({ costUsd: 1.25, ip: "chat-d", runId: chatRun() });
    expect(RunsService.committedSpendTodayUsd()).toBeCloseTo(before + 1.25);
  });
});
