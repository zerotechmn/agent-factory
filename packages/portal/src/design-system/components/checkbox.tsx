
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { cn } from "../lib/cn";

export type CheckboxProps = Omit<CheckboxPrimitive.Root.Props, "className" | "children"> & {
  label?: string;
  error?: string;
  className?: string;
};

export function Checkbox({
  className,
  label,
  error,
  id,
  indeterminate,
  disabled,
  ...props
}: CheckboxProps) {
  const fieldId = id || props.name;

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          "inline-flex items-start gap-2 text-[length:var(--ds-text-sm)] text-[var(--ds-text)]",
          disabled && "opacity-40",
        )}
      >
        <CheckboxPrimitive.Root
          id={fieldId}
          disabled={disabled}
          indeterminate={indeterminate}
          aria-invalid={!!error || undefined}
          className={cn(
            "mt-0.5 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-[var(--ds-border-muted)] bg-[var(--ds-bg)] text-[var(--ds-button-text)] transition-colors duration-[var(--ds-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] data-checked:border-[var(--ds-button-bg)] data-checked:bg-[var(--ds-button-bg)] data-disabled:cursor-not-allowed data-indeterminate:border-[var(--ds-button-bg)] data-indeterminate:bg-[var(--ds-button-bg)]",
            error && "border-[var(--ds-error)] data-checked:border-[var(--ds-error)] data-indeterminate:border-[var(--ds-error)]",
            className,
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
            {indeterminate ? (
              <IconMinus className="size-3" stroke={1.75} aria-hidden />
            ) : (
              <IconCheck className="size-3" stroke={1.75} aria-hidden />
            )}
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {label && <span>{label}</span>}
      </label>
      {error && <p className="text-[length:var(--ds-text-xs)] text-[var(--ds-error)]">{error}</p>}
    </div>
  );
}
