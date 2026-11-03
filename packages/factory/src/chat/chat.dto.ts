import { z } from "zod";

import { CHAT_MAX_HISTORY_CHARS, CHAT_MAX_MESSAGE_CHARS, CHAT_MAX_MESSAGES } from "./chat.constants";

// The AI SDK's UIMessage, narrowed to what the server reads: text parts. Other
// part types (step markers, files) are accepted and ignored.
const uiMessageSchema = z.object({
  id: z.string().max(100),
  parts: z.array(z.looseObject({ text: z.string().optional(), type: z.string().max(50) })).max(50),
  role: z.enum(["user", "assistant"]),
});

export const chatRequestSchema = z
  .object({ messages: z.array(uiMessageSchema).min(1).max(CHAT_MAX_MESSAGES, "This conversation is too long. Clear it to start a new one.") })
  .superRefine(({ messages }, ctx) => {
    const last = messages.at(-1);
    const question = last ? textOf(last).trim() : "";
    if (last?.role !== "user" || question.length === 0) {
      ctx.addIssue({ code: "custom", message: "The last message must be your question" });
    } else if (question.length > CHAT_MAX_MESSAGE_CHARS) {
      ctx.addIssue({ code: "custom", message: `Keep questions under ${CHAT_MAX_MESSAGE_CHARS.toLocaleString("en")} characters` });
    }
    if (messages.reduce((sum, m) => sum + textOf(m).length, 0) > CHAT_MAX_HISTORY_CHARS) {
      ctx.addIssue({ code: "custom", message: "This conversation is too long. Clear it to start a new one." });
    }
  });

export type ChatUIMessage = z.infer<typeof uiMessageSchema>;

export function textOf(message: ChatUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}
