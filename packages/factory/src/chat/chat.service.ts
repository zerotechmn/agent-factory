import Anthropic from "@anthropic-ai/sdk";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { config } from "../lib/config";
import { TooManyRequestsError, ValidationError } from "../lib/errors";
import { readStageReport, runPaths } from "../pipeline/pipeline.artifacts";
import * as RunsService from "../runs/runs.service";
import { CHAT_MAX_TOKENS, CHAT_RESERVE_USD, CHAT_SYSTEM_PROMPT } from "./chat.constants";
import { chatRequestSchema } from "./chat.dto";
import * as ChatStore from "./chat.store";
import { buildRunRecord, costUsd, toApiMessages } from "./chat.utils";

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// Bun closes a connection after 10 s without data, and the model can think for longer than that before it writes.
const KEEP_ALIVE_MS = 5_000;

/**
 * Answers the latest question about a run as an AI SDK UI message stream, so
 * the portal's useChat can render it, stop it and regenerate it. The client
 * sends the whole conversation each time; nothing is stored but the cost.
 */
export async function streamAnswer({ body, id, ip, signal }: { body: unknown; id: string; ip: string; signal: AbortSignal }) {
  const run = RunsService.getRunDetail(id);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
  checkLimits(ip);

  const paths = runPaths(config.DATA_DIR, run.id);
  const reports = await Promise.all(run.stages.map(async (s) => ({ dirName: s.dirName, markdown: await readStageReport(paths, s.dirName) })));
  const messages = toApiMessages(parsed.data.messages);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const textId = crypto.randomUUID();
      let wrote = false;
      const answer = client.beta.messages.stream(
        {
          betas: ["server-side-fallback-2026-07-01"],
          // Caches the conversation so far, so each follow-up only pays full price for the new turn.
          cache_control: { type: "ephemeral" },
          // On a safety decline, the API retries on a model chosen for the decline's category.
          fallbacks: "default",
          max_tokens: CHAT_MAX_TOKENS,
          messages,
          model: config.CHAT_MODEL,
          // Questions about a report rarely need deep thought, and low effort answers sooner.
          output_config: { effort: "low" },
          system: [
            { text: CHAT_SYSTEM_PROMPT, type: "text" },
            { text: buildRunRecord(run, reports), type: "text" },
          ],
        },
        { signal },
      );

      try {
        for await (const event of answer) {
          if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
          if (!wrote) {
            // Until the first word the client shows "thinking"; `start` moves it to streaming.
            writer.write({ type: "start" });
            writer.write({ id: textId, type: "text-start" });
            wrote = true;
          }
          writer.write({ delta: event.delta.text, id: textId, type: "text-delta" });
        }
        if (wrote) writer.write({ id: textId, type: "text-end" });

        const final = await answer.finalMessage();
        if (final.stop_reason === "refusal") {
          writer.write({ errorText: "Claude declined to answer this. Try asking it another way.", type: "error" });
          return;
        }
        if (!wrote) {
          writer.write({ errorText: "No answer came back. Try again.", type: "error" });
          return;
        }
        writer.write({ finishReason: final.stop_reason === "max_tokens" ? "length" : "stop", type: "finish" });
      } catch (error) {
        // The customer pressed stop or left; there is nobody to tell.
        if (error instanceof Anthropic.APIUserAbortError) return;
        throw error;
      } finally {
        const usage = answer.receivedMessages.at(-1)?.usage ?? answer.currentMessage?.usage ?? null;
        ChatStore.recordUsage({ costUsd: costUsd(config.CHAT_MODEL, usage), ip, runId: run.id });
      }
    },
    onError: errorText,
  });

  return createUIMessageStreamResponse({ keepAliveMs: KEEP_ALIVE_MS, stream });
}

function checkLimits(ip: string): void {
  if (ChatStore.countMessagesByIpSince(ip, RunsService.startOfUtcDay()) >= config.CHAT_MESSAGES_PER_IP_PER_DAY) {
    throw new TooManyRequestsError(`Limit of ${config.CHAT_MESSAGES_PER_IP_PER_DAY} questions per day reached. Try again tomorrow.`);
  }
  if (RunsService.committedSpendTodayUsd() + CHAT_RESERVE_USD > config.DAILY_SPEND_CAP_USD) {
    throw new TooManyRequestsError("The factory has reached today's spending limit. Try again tomorrow.");
  }
}

/** What the customer sees when the answer fails mid-stream; the details stay in the log. */
function errorText(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529)) {
    return "Claude is busy right now. Try again in a moment.";
  }
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
  console.error("[chat] answer failed", error);
  return "Something went wrong while answering. Try again.";
}
