import { code } from "@streamdown/code";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

import { cn } from "@/lib/utils";

const PLUGINS = { code };

const CONTROLS = {
  code: { copy: true, download: true },
  table: { copy: true, download: true, fullscreen: true },
} as const;

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Agent-written Markdown. While `isAnimating`, unfinished syntax (an open code
 * fence, a half-typed table) is completed per render so the layout does not jump,
 * and new words fade in. Raw HTML is sanitized and links confirm before leaving.
 */
export const MessageResponse = memo(
  function MessageResponse({ className, isAnimating = false, ...props }: MessageResponseProps) {
    return (
      <Streamdown
        animated
        caret="block"
        className={cn("ai-response min-w-0 text-[15px] leading-7 text-ds-fg", className)}
        controls={CONTROLS}
        isAnimating={isAnimating}
        plugins={PLUGINS}
        shikiTheme={["github-light", "github-dark"]}
        {...props}
      />
    );
  },
  (prev, next) => prev.children === next.children && prev.isAnimating === next.isAnimating && prev.className === next.className,
);
