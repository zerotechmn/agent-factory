import { cn } from "../lib/cn";

export function Progress({
  value,
  label,
  size = "md",
  className,
}: {
  value: number;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex justify-between text-[length:var(--ds-text-xs)] text-[var(--ds-text-sec)]">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
        className={cn(
          "w-full overflow-hidden rounded-full bg-[var(--ds-card-02)]",
          size === "sm" ? "h-1" : "h-1.5",
        )}
      >
        <div
          className="h-full rounded-full bg-[var(--ds-button-bg)] transition-[width] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-out)]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
