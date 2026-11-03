import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import type { UIMessage } from "ai";
import { Suspense, useEffect, useState, type ReactElement } from "react";

import { LazyMessageResponse } from "@/components/ai-elements/lazy-response";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COPIED_MS = 1_500;

export function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** The customer's question: plain text in a bubble, never Markdown. */
export function UserMessage({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ds-card-3 px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-ds-fg">
        <span className="sr-only">You: </span>
        {textOf(message)}
      </p>
    </div>
  );
}

/**
 * Claude's answer, unboxed, at reading width. Its actions sit underneath: always on the
 * latest answer, on hover or focus for earlier ones (always on touch screens).
 */
export function AssistantMessage({
  latest,
  message,
  onRegenerate,
  streaming,
}: {
  latest: boolean;
  message: UIMessage;
  /** Only the latest answer can be regenerated, and only once it has finished. */
  onRegenerate?: () => void;
  streaming: boolean;
}) {
  const text = textOf(message);
  return (
    <div className="group/message">
      <span className="sr-only">Claude: </span>
      {/* The plain text stands in while the renderer loads, so nothing jumps or blanks. */}
      <Suspense fallback={<p className="text-[15px] leading-7 whitespace-pre-wrap text-ds-fg">{text}</p>}>
        <LazyMessageResponse isAnimating={streaming}>{text}</LazyMessageResponse>
      </Suspense>
      {!streaming && text && (
        <div
          className={cn(
            "mt-1 -ml-1.5 flex gap-0.5 transition-opacity",
            !latest && "pointer-coarse:opacity-100 opacity-0 group-hover/message:opacity-100 focus-within:opacity-100",
          )}
        >
          <CopyButton text={text} />
          {onRegenerate && (
            <ActionButton label="Regenerate answer" onClick={onRegenerate}>
              <IconRefresh aria-hidden />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

/** Shown from sending until the first word arrives; the model thinks before it writes. */
export function ThinkingIndicator() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-ds-fg-sec">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      Thinking
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <ActionButton
      label={copied ? "Copied" : "Copy answer"}
      onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}
    >
      {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
    </ActionButton>
  );
}

function ActionButton({ children, label, onClick }: { children: ReactElement; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} className="text-ds-fg-sec hover:text-ds-fg" onClick={onClick} size="icon-sm" variant="ghost">
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
