import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "factory:chat:";
/** Re-render at most this often while tokens stream in; Streamdown re-parses on each render. */
const THROTTLE_MS = 50;

/**
 * The Ask tab's conversation about one run. The server keeps no history, so the
 * conversation lives in this browser and survives switching tabs or reloading.
 */
export function useRunChat(runId: string) {
  const [initial] = useState(() => loadMessages(runId));
  const transport = useMemo(() => new DefaultChatTransport({ api: `/api/runs/${runId}/chat` }), [runId]);
  const chat = useChat({ id: `run-${runId}`, messages: initial, throttle: THROTTLE_MS, transport });
  const { clearError, messages, setMessages, status } = chat;

  // Saved only between answers: a half-streamed one would come back as if it were complete.
  useEffect(() => {
    if (status === "ready" || status === "error") saveMessages(runId, messages);
  }, [messages, runId, status]);

  const clear = useCallback(() => {
    clearError();
    setMessages([]);
    saveMessages(runId, []);
  }, [clearError, runId, setMessages]);

  return {
    ...chat,
    clear,
    errorMessage: chat.error ? readableError(chat.error) : null,
    errorRetryable: chat.error ? isRetryable(chat.error) : false,
  };
}

/** A refusal (bad input, a limit) fails the same way again; a dropped connection or server fault may not. */
function isRetryable(error: Error): boolean {
  const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : null;
  return status === null || status >= 500;
}

/** A refusal before streaming starts (limits, bad input) arrives as the API's JSON envelope. */
function readableError(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  } catch {
    // Not JSON: a stream error the server already worded, or a network failure.
  }
  return error.message === "Failed to fetch" ? "Couldn't reach the factory. Check your connection and try again." : error.message;
}

function loadMessages(runId: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + runId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(runId: string, messages: UIMessage[]): void {
  try {
    if (messages.length === 0) localStorage.removeItem(STORAGE_PREFIX + runId);
    else localStorage.setItem(STORAGE_PREFIX + runId, JSON.stringify(messages));
  } catch {
    // Storage full or blocked (private mode): the conversation still works, it just won't survive a reload.
  }
}
