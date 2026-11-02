
import { Field } from "@base-ui/react/field";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "../lib/cn";
import type { ComponentProps, ReactNode } from "react";

export type InputProps = Omit<ComponentProps<typeof InputPrimitive>, "size" | "className"> & {
  label?: string;
  helperText?: string;
  error?: string;
  icon?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputSize?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "text-[length:var(--ds-text-sm)] px-2.5 py-1.5",
  md: "text-[length:var(--ds-text-base)] px-3 py-2",
  lg: "text-[length:var(--ds-text-base)] px-4 py-3",
};

export function Input({
  className,
  label,
  helperText,
  error,
  icon,
  prefix,
  suffix,
  id,
  name,
  inputSize = "md",
  disabled,
  ...props
}: InputProps) {
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
      <div
        className={cn(
          "flex items-center gap-2 rounded-[var(--ds-radius-xs)] border bg-[var(--ds-bg)] transition-colors",
          error
            ? "border-[var(--ds-error)]"
            : "border-[var(--ds-border)] focus-within:border-[var(--ds-border-strong)]",
          disabled && "opacity-40",
          sizeClasses[inputSize],
        )}
      >
        {icon}
        {prefix && <span className="text-[var(--ds-text-sec)]">{prefix}</span>}
        <InputPrimitive
          id={id}
          disabled={disabled}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-tertiary)]",
            className,
          )}
          {...props}
        />
        {suffix && <span className="text-[var(--ds-text-sec)]">{suffix}</span>}
      </div>
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
