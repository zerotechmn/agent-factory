
import { Field } from "@base-ui/react/field";
import { cn } from "../lib/cn";
import type { ComponentProps } from "react";

export type TextareaProps = Omit<
  ComponentProps<"textarea">,
  "size" | "onChange" | "defaultValue" | "value"
> & {
  label?: string;
  helperText?: string;
  error?: string;
  fieldSize?: "sm" | "md" | "lg";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: ComponentProps<"textarea">["onChange"];
};

const sizeClasses = {
  sm: "text-[length:var(--ds-text-sm)] px-2.5 py-1.5 min-h-20",
  md: "text-[length:var(--ds-text-base)] px-3 py-2 min-h-28",
  lg: "text-[length:var(--ds-text-base)] px-4 py-3 min-h-36",
};

export function Textarea({
  className,
  label,
  helperText,
  error,
  id,
  name,
  fieldSize = "md",
  disabled,
  value,
  defaultValue,
  onValueChange,
  onChange,
  ...props
}: TextareaProps) {
  return (
    <Field.Root
      name={name}
      disabled={disabled}
      invalid={!!error || undefined}
      className="flex w-full flex-col gap-1.5"
    >
      {label && (
        <Field.Label className="text-[length:var(--ds-text-sm)] text-[var(--ds-text)]">
          {label}
        </Field.Label>
      )}
      <Field.Control
        id={id}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        render={<textarea onChange={onChange} {...props} />}
        className={cn(
          "w-full rounded-[var(--ds-radius-xs)] border bg-[var(--ds-bg)] text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-tertiary)] transition-colors data-disabled:opacity-40",
          error
            ? "border-[var(--ds-error)]"
            : "border-[var(--ds-border)] focus:border-[var(--ds-border-strong)]",
          sizeClasses[fieldSize],
          className,
        )}
      />
      {error ? (
        <Field.Error
          match
          className="text-[length:var(--ds-text-xs)] text-[var(--ds-error)]"
        >
          {error}
        </Field.Error>
      ) : helperText ? (
        <Field.Description className="text-[length:var(--ds-text-xs)] text-[var(--ds-text-sec)]">
          {helperText}
        </Field.Description>
      ) : null}
    </Field.Root>
  );
}
