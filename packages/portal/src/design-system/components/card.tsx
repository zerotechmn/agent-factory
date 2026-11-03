import { cn } from "../lib/cn";
import type { HTMLAttributes } from "react";

export function Card({
  className,
  bordered = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { bordered?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex w-full shrink-0 flex-col rounded-[var(--ds-radius-xs)] bg-[var(--ds-card)] text-[var(--ds-text)]",
        bordered ? "card-border" : "shadow-[var(--ds-shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-[var(--ds-g1-5)] pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[length:var(--ds-text-base)] font-normal tracking-[var(--ds-tracking-base)] text-[var(--ds-text)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[length:var(--ds-text-sm)] text-[var(--ds-text-sec)] tracking-[var(--ds-tracking-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex grow flex-col p-[var(--ds-g1-5)]", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto flex items-center gap-[var(--ds-grid-gap)] p-[var(--ds-g1-5)] pt-0", className)}
      {...props}
    />
  );
}

/** Link-styled card shell used for changelog / list tiles */
export function CardLink({
  className,
  ...props
}: HTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      className={cn(
        "card flex h-full grow flex-col rounded-[var(--ds-radius-xs)] bg-[var(--ds-card)] pb-[var(--ds-g2)] text-[var(--ds-text)] no-underline shadow-[var(--ds-shadow-card)] transition-colors duration-[var(--ds-duration)] hover:bg-[var(--ds-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)]",
        className,
      )}
      {...props}
    />
  );
}
