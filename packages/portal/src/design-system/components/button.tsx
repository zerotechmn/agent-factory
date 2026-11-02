import { cn } from "../lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "tertiary"
  | "destructive"
  | "link";
export type ButtonSize = "default" | "sm" | "xs" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--ds-button-bg)] text-[var(--ds-button-text)] border border-[var(--ds-button-bg)] hover:bg-[var(--ds-button-hover-bg)] hover:border-[var(--ds-button-hover-bg)]",
  secondary:
    "bg-[var(--ds-button-secondary-surface)] text-[var(--ds-button-sec-text)] border border-[var(--ds-border-subtle)] hover:bg-[var(--ds-card-hover)]",
  ghost:
    "bg-transparent text-[var(--ds-text)] border border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-hover)]",
  tertiary:
    "bg-transparent border-transparent text-[var(--ds-text)] rounded-none px-0 py-0 hover:opacity-70 gap-[0.25em]",
  destructive:
    "bg-[var(--ds-error)] text-[var(--ds-white)] border border-[var(--ds-error)] hover:opacity-90",
  link: "bg-transparent border-transparent text-[var(--ds-text)] underline-offset-4 hover:underline px-0",
};

const sizes: Record<ButtonSize, string> = {
  default: "text-[length:var(--ds-text-base)] py-[0.89em] px-[1.45em]",
  sm: "text-[length:var(--ds-text-sm)] py-[0.45em] px-[0.8em]",
  xs: "text-[length:var(--ds-text-xs)] py-[0.15em] px-[0.5em]",
  icon: "size-9 p-0 inline-flex items-center justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  icon,
  iconPosition = "start",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-[family-name:var(--ds-font-sans)] font-normal transition-[background,border-color,opacity,color] duration-[var(--ds-duration)] ease-[var(--ds-ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : (
        icon && iconPosition === "start" && icon
      )}
      {children}
      {!loading && icon && iconPosition === "end" && icon}
    </button>
  );
}

export function buttonVariants({
  variant = "primary",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-[family-name:var(--ds-font-sans)] font-normal transition-[background,border-color,opacity,color] duration-[var(--ds-duration)] ease-[var(--ds-ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] cursor-pointer no-underline",
    variants[variant],
    sizes[size],
    className,
  );
}
