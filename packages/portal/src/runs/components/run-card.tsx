import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

import { cn } from "@/lib/utils";

/** A raised card on the page background, like the new-run composer; the card tone in dark mode. */
export const CARD_CLASS = "rounded-xl border border-border bg-[var(--ds-white)] shadow-[var(--ds-shadow-card)] dark:bg-card";

/** A summary card with a title and one link to the page that has the detail. */
export function RunCard({
  children,
  className,
  href,
  linkLabel,
  title,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  linkLabel?: string;
  title: string;
}) {
  return (
    <section className={cn(CARD_CLASS, "p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-ds-fg-sec">{title}</h2>
        {href && (
          <Link
            href={href}
            aria-label={`${linkLabel ?? "Open"} ${title.toLowerCase()}`}
            className="-m-1 flex items-center gap-0.5 rounded p-1 text-xs text-ds-fg-sec transition-colors hover:text-ds-fg focus-visible:outline-2 focus-visible:outline-ds-accent"
          >
            {linkLabel ?? "Open"}
            <IconArrowUpRight className="size-3.5 text-ds-fg opacity-60" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
