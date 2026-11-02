import { cn } from "../lib/cn";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon?: ReactNode;
  muted?: boolean;
};

export function Link({ className, icon, muted, children, ...props }: LinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1 underline-offset-4 transition-opacity hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)]",
        muted ? "text-[var(--ds-text-sec)]" : "text-[var(--ds-text)]",
        props["aria-disabled"] && "pointer-events-none opacity-40",
        className,
      )}
      {...props}
    >
      {children}
      {icon}
    </a>
  );
}
