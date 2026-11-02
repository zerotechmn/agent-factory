import { cn } from "../lib/cn";

export function Spinner({
  className,
  size = "md",
  label = "Loading",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const sizes = { sm: "size-3.5 border-2", md: "size-5 border-2", lg: "size-8 border-[3px]" };
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-[var(--ds-border-muted)] border-t-[var(--ds-text)] motion-reduce:animate-none",
        sizes[size],
        className,
      )}
    />
  );
}
