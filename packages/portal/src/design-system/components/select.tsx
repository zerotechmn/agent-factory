
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { IconCheck, IconSelector } from "@tabler/icons-react";
import { cn } from "../lib/cn";
import type { ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  label?: string;
  helperText?: string;
  error?: string;
  placeholder?: string;
  icon?: ReactNode;
  options: SelectOption[];
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
};

export function Select({
  className,
  label,
  helperText,
  error,
  placeholder,
  icon,
  options,
  id,
  name,
  disabled,
  required,
  value,
  defaultValue = null,
  onValueChange,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
    >
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <SelectPrimitive.Label className="text-[length:var(--ds-text-sm)] text-[var(--ds-text)]">
            {label}
          </SelectPrimitive.Label>
        )}
        <SelectPrimitive.Trigger
          aria-invalid={!!error || undefined}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-[var(--ds-radius-xs)] border bg-[var(--ds-bg)] px-3 py-2 text-left text-[length:var(--ds-text-base)] text-[var(--ds-text)] outline-none transition-colors duration-[var(--ds-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] data-disabled:cursor-not-allowed data-disabled:opacity-40",
            error ? "border-[var(--ds-error)]" : "border-[var(--ds-border)]",
            className,
          )}
        >
          {icon && <span className="shrink-0 text-[var(--ds-text-sec)]">{icon}</span>}
          <SelectPrimitive.Value
            placeholder={placeholder}
            className="min-w-0 flex-1 truncate data-placeholder:text-[var(--ds-text-tertiary)]"
          />
          <SelectPrimitive.Icon className="ml-auto shrink-0 text-[var(--ds-text-sec)]">
            <IconSelector className="size-4" stroke={1.75} aria-hidden />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        {error ? (
          <p className="text-[length:var(--ds-text-xs)] text-[var(--ds-error)]">{error}</p>
        ) : helperText ? (
          <p className="text-[length:var(--ds-text-xs)] text-[var(--ds-text-sec)]">{helperText}</p>
        ) : null}
      </div>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="z-[var(--ds-z-dropdown)] outline-none"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup
            className={cn(
              "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-[var(--ds-radius-xs)] border border-[var(--ds-border)] bg-[var(--ds-card)] p-1 text-[var(--ds-text)] shadow-[var(--ds-shadow-flyout)] outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <SelectPrimitive.List>
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    "flex cursor-default items-center gap-2 rounded-[var(--ds-radius-2xs)] px-2 py-1.5 text-[length:var(--ds-text-sm)] outline-none select-none",
                    "data-highlighted:bg-[var(--ds-card-02)] data-selected:font-medium",
                    "data-disabled:pointer-events-none data-disabled:opacity-40",
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="flex size-4 shrink-0 items-center justify-center text-[var(--ds-text)]">
                    <IconCheck className="size-3.5" stroke={1.75} aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                    {opt.label}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
