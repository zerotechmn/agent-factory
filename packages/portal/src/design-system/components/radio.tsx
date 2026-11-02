import { cn } from "../lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  error?: string;
};

export function Radio({ className, label, error, id, disabled, ...props }: RadioProps) {
  const fieldId = id || `${props.name}-${props.value}`;
  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          "inline-flex items-start gap-2 text-[length:var(--ds-text-sm)] text-[var(--ds-text)]",
          disabled && "opacity-40",
        )}
      >
        <input
          id={fieldId}
          type="radio"
          disabled={disabled}
          aria-invalid={!!error || undefined}
          className={cn(
            "mt-0.5 size-4 shrink-0 cursor-pointer border border-[var(--ds-border-muted)] accent-[var(--ds-button-bg)]",
            className,
          )}
          {...props}
        />
        {label && <span>{label}</span>}
      </label>
      {error && <p className="text-[length:var(--ds-text-xs)] text-[var(--ds-error)]">{error}</p>}
    </div>
  );
}

export function RadioGroup({
  legend,
  children,
  className,
}: {
  legend?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2 border-0 p-0", className)}>
      {legend && (
        <legend className="mb-1 text-[length:var(--ds-text-sm)] text-[var(--ds-text)]">{legend}</legend>
      )}
      {children}
    </fieldset>
  );
}
