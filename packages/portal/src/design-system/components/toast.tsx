
import { cn } from "../lib/cn";
import { useEffect, type ReactNode } from "react";

export type ToastTone = "default" | "success" | "error" | "warning";

export type ToastProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: ReactNode;
  tone?: ToastTone;
  icon?: ReactNode;
  action?: ReactNode;
  duration?: number;
  className?: string;
};

const tones: Record<ToastTone, string> = {
  default: "bg-[var(--ds-card)] border-[var(--ds-border)]",
  success: "bg-[var(--ds-success-bg)] border-[var(--ds-success)]/30",
  error: "bg-[var(--ds-error-bg)] border-[var(--ds-error)]/30",
  warning: "bg-[var(--ds-warning-bg)] border-[var(--ds-warning)]/30",
};

export function Toast({
  open,
  onOpenChange,
  title,
  description,
  tone = "default",
  icon,
  action,
  duration = 5000,
  className,
}: ToastProps) {
  useEffect(() => {
    if (!open || !duration) return;
    const t = window.setTimeout(() => onOpenChange(false), duration);
    return () => window.clearTimeout(t);
  }, [open, duration, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed right-4 bottom-4 z-[var(--ds-z-toast)] flex max-w-sm items-start gap-3 rounded-[var(--ds-radius-xs)] border p-3 text-[var(--ds-text)] shadow-[var(--ds-shadow-flyout)]",
        tones[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {title && <p className="text-[length:var(--ds-text-sm)] font-medium">{title}</p>}
        {description && (
          <div className="text-[length:var(--ds-text-xs)] text-[var(--ds-text-sec)]">{description}</div>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onOpenChange(false)}
        className="cursor-pointer text-[var(--ds-text-sec)] hover:text-[var(--ds-text)]"
      >
        ×
      </button>
    </div>
  );
}
