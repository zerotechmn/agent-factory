import { respond } from "../lib/respond";
import * as ChatService from "./chat.service";

/** A stream on success; a refusal before it starts (limits, bad input, unknown run) uses the usual JSON envelope. */
export async function streamAnswer(input: Parameters<typeof ChatService.streamAnswer>[0]) {
  try {
    return await ChatService.streamAnswer(input);
  } catch (error) {
    return respond(() => Promise.reject(error), { tag: "chat" });
  }
}
