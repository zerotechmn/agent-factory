import { cn } from "../lib/cn";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export function Breadcrumb({
  items,
  separator = "/",
  className,
}: {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[length:var(--ds-text-sm)]">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-[var(--ds-text-tertiary)]">
                  {separator}
                </span>
              )}
              {item.href && !isLast && !item.disabled ? (
                <a
                  href={item.href}
                  className="inline-flex items-center gap-1 text-[var(--ds-text-sec)] hover:text-[var(--ds-text)]"
                >
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1",
                    isLast ? "text-[var(--ds-text)]" : "text-[var(--ds-text-sec)]",
                    item.disabled && "opacity-40",
                  )}
                >
                  {item.icon}
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
