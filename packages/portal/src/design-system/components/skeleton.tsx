import { cn } from "../lib/cn";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-[var(--ds-radius-xs)] bg-[var(--ds-card-02)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
