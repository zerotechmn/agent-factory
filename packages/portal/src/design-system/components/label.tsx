import { cn } from "../lib/cn";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[length:var(--ds-text-sm)] text-[var(--ds-text)]", className)}
      {...props}
    />
  );
}
