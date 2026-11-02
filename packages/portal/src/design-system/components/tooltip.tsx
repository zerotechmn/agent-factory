
import { cn } from "../lib/cn";
import { useId, useState, type ReactNode } from "react";

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const position = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left: "right-full top-1/2 mr-2 -translate-y-1/2",
    right: "left-full top-1/2 ml-2 -translate-y-1/2",
  }[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[var(--ds-z-tooltip)] whitespace-nowrap rounded-[var(--ds-radius-xs)] bg-[var(--ds-fg)] px-2 py-1 text-[length:var(--ds-text-xs)] text-[var(--ds-bg)] shadow-[var(--ds-shadow-flyout)]",
            position,
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
