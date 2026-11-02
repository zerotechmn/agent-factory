import { cn } from "../lib/cn";
import type { HTMLAttributes, OlHTMLAttributes, ReactNode } from "react";

export function List({
  ordered,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLUListElement> &
  OlHTMLAttributes<HTMLOListElement> & { ordered?: boolean; children?: ReactNode }) {
  const Comp = ordered ? "ol" : "ul";
  return (
    <Comp
      className={cn(
        "flex flex-col gap-1 pl-5 text-[length:var(--ds-text-base)] text-[var(--ds-text)]",
        ordered ? "list-decimal" : "list-disc",
        "marker:text-[var(--ds-text-tertiary)]",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function ListItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("pl-1", className)} {...props} />;
}
