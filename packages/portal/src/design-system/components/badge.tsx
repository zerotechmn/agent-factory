import { cn } from "../lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "default" | "accent" | "success" | "error" | "warning" | "outline";
export type BadgeSize = "sm" | "md";

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--ds-card-02)] text-[var(--ds-text)]",
  accent: "bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]",
  success: "bg-[var(--ds-success-bg)] text-[var(--ds-success)]",
  error: "bg-[var(--ds-error-bg)] text-[var(--ds-error)]",
  warning: "bg-[var(--ds-warning-bg)] text-[var(--ds-warning)]",
  outline: "bg-transparent border border-[var(--ds-border)] text-[var(--ds-text-sec)]",
};

const sizes: Record<BadgeSize, string> = {
  sm: "text-[length:var(--ds-text-xs)] px-1.5 py-0.5",
  md: "text-[length:var(--ds-text-sm)] px-2 py-0.5",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  onDismiss?: () => void;
};

export function Badge({
  className,
  variant = "default",
  size = "sm",
  icon,
  onDismiss,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-normal",
        variants[variant],
        sizes[size],
        !children && "aspect-square justify-center px-0",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-0.5 inline-flex size-3.5 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}
