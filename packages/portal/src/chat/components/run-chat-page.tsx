import { IconArrowDown, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";

import { Alert } from "../../design-system";
import { useRun } from "../../runs/runs.hooks";
import type { Run } from "../../runs/runs.types";
import { RunPage } from "../../runs/components/run-chrome";
import { useRunChat } from "../chat.hooks";
import { AssistantMessage, ThinkingIndicator, UserMessage } from "./chat-message";

const MAX_QUESTION_LENGTH = 4_000;

export function RunChatPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const chat = useRunChat(id);
  const { atBottom, contentRef, scrollRef, scrollToBottom } = useStickToBottom<HTMLDivElement, HTMLDivElement>();
  const [input, setInput] = useState("");

  const busy = chat.status === "submitted" || chat.status === "streaming";
  const question = input.trim();
  const last = chat.messages.at(-1);

  const ask = (text: string) => {
    if (busy || !text.trim()) return;
    if (chat.error) chat.clearError();
    void chat.sendMessage({ text: text.trim() });
    setInput("");
    scrollToBottom("auto");
  };

  return (
    <RunPage active="/chat" fill id={id} run={run} width="max-w-3xl">
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto [scrollbar-gutter:stable]">
            <div
              ref={contentRef}
              role="log"
              aria-label="Conversation about this run"
              aria-busy={busy}
              className="flex min-h-full flex-col gap-6 pt-2 pb-6"
            >
              {chat.messages.length === 0 ? (
                <EmptyState onAsk={ask} run={run} />
              ) : (
                chat.messages.map((message) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      latest={message === last}
                      message={message}
                      onRegenerate={message === last && !busy ? () => void chat.regenerate() : undefined}
                      streaming={message === last && chat.status === "streaming"}
                    />
                  ),
                )
              )}
              {chat.status === "submitted" && <ThinkingIndicator />}
              {chat.errorMessage && (
                <Alert tone="error" className="flex flex-wrap items-center justify-between gap-2">
                  <span>{chat.errorMessage}</span>
                  {chat.errorRetryable && last?.role === "user" && (
                    <Button size="sm" variant="outline" onClick={() => void chat.regenerate()}>
                      Try again
                    </Button>
                  )}
                </Alert>
              )}
            </div>
          </div>

          {!atBottom && (
            <Button
              aria-label="Scroll to the latest message"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-[var(--ds-shadow-card)]"
              onClick={() => scrollToBottom()}
              size="icon-sm"
              variant="outline"
            >
              <IconArrowDown aria-hidden />
            </Button>
          )}
        </div>

        <PromptInput
          onSubmit={() => ask(input)}
          className="*:data-[slot=input-group]:rounded-xl *:data-[slot=input-group]:border-border *:data-[slot=input-group]:bg-[var(--ds-white)] *:data-[slot=input-group]:shadow-[var(--ds-shadow-card)] dark:*:data-[slot=input-group]:bg-card *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:border-ring/40 *:data-[slot=input-group]:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/10"
        >
          <PromptInputBody>
            <PromptInputTextarea
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              aria-label="Ask about this run"
              placeholder="Ask about this run"
              className="min-h-12 text-base md:text-sm"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {chat.messages.length > 0 && (
                <Button className="text-ds-fg-sec" disabled={busy} onClick={chat.clear} size="sm" variant="ghost">
                  <IconTrash data-icon="inline-start" aria-hidden />
                  Clear
                </Button>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              className="rounded-full"
              disabled={!busy && !question}
              onStop={() => void chat.stop()}
              // Only the busy states change the button; after an error it stays a plain send button.
              status={busy ? chat.status : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-ds-fg-ter">Answers come from this run's reports and can be wrong.</p>
      </div>
    </RunPage>
  );
}

function EmptyState({ onAsk, run }: { onAsk: (question: string) => void; run?: Run }) {
  return (
    <div className="my-auto flex flex-col items-center gap-4 py-10 text-center">
      <div>
        <h2 className="text-lg text-ds-fg">Ask about this run</h2>
        <p className="mt-1 text-sm text-ds-fg-sec">Answers come from your request, each stage's status and the agents' reports.</p>
      </div>
      <Suggestions className="mx-auto">
        {suggestionsFor(run).map((s) => (
          <Suggestion key={s} suggestion={s} onClick={onAsk} />
        ))}
      </Suggestions>
    </div>
  );
}

function suggestionsFor(run?: Run): string[] {
  if (run?.status === "failed" || run?.status === "failed_budget") {
    return ["Why did this run fail?", "What did the agents finish?", "How was the budget spent?"];
  }
  if (run?.status === "deployed" || run?.status === "deployed_partial") {
    return ["What did the factory build?", "Which features are in the app?", "Are there known issues?"];
  }
  return ["What is happening right now?", "What does the spec include?", "How was the budget spent?"];
}
