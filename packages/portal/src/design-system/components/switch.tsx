
import { cn } from "../lib/cn";
import type { ButtonHTMLAttributes } from "react";

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
};

export function Switch({
  className,
  checked = false,
  onCheckedChange,
  label,
  disabled,
  id,
  ...props
}: SwitchProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : props["aria-label"]}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-[var(--ds-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] disabled:cursor-not-allowed disabled:opacity-40",
          checked
            ? "border-[var(--ds-button-bg)] bg-[var(--ds-button-bg)]"
            : "border-[var(--ds-border-muted)] bg-[var(--ds-card-02)]",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-[var(--ds-bg)] shadow transition-transform duration-[var(--ds-duration)] ease-[var(--ds-ease-spring)]",
            checked && "translate-x-4 bg-[var(--ds-button-text)]",
          )}
        />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-[length:var(--ds-text-sm)] text-[var(--ds-text)]">
          {label}
        </label>
      )}
    </div>
  );
}
