import { cn } from "../lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type AlertTone = "info" | "success" | "warning" | "error";

const tones: Record<AlertTone, string> = {
  info: "bg-[var(--ds-card)] border-[var(--ds-border)] text-[var(--ds-text)]",
  success: "bg-[var(--ds-success-bg)] border-[var(--ds-success)]/30 text-[var(--ds-text)]",
  warning: "bg-[var(--ds-warning-bg)] border-[var(--ds-warning)]/30 text-[var(--ds-text)]",
  error: "bg-[var(--ds-error-bg)] border-[var(--ds-error)]/30 text-[var(--ds-text)]",
};

const roles: Record<AlertTone, "status" | "alert"> = {
  info: "status",
  success: "status",
  warning: "alert",
  error: "alert",
};

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function Alert({
  className,
  tone = "info",
  title,
  icon,
  action,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={roles[tone]}
      className={cn(
        "flex w-full gap-3 rounded-[var(--ds-radius-xs)] border px-[var(--ds-g1-5)] py-[var(--ds-g1)]",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon && <div className="mt-0.5 shrink-0 text-[var(--ds-text-sec)]">{icon}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && (
          <p className="text-[length:var(--ds-text-base)] font-medium text-[var(--ds-text)]">{title}</p>
        )}
        <div className="text-[length:var(--ds-text-sm)] text-[var(--ds-text-sec)]">{children}</div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
