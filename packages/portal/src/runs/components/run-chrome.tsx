import { IconCheck, IconLayoutSidebarRight, IconLink } from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { Badge } from "../../design-system";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES } from "../runs.constants";
import type { Run } from "../runs.types";
import { PipelinePopover } from "./run-pipeline-popover";

const COPIED_MS = 1_500;

/** The run's name lives here, small, as in a project page's top bar; the body starts with the brief itself. */
export function RunTopBar({ run }: { run?: Run }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-3 bg-background/90 shadow-[0_1px_0_var(--border)] pr-4 pl-14 backdrop-blur md:px-6">
      {run ? (
        <PipelinePopover run={run} />
      ) : (
        <span className="size-7 shrink-0 rounded-md bg-ds-card-2" />
      )}
      {run ? (
        <>
          <h1 className="min-w-0 truncate text-sm font-medium" title={run.prompt}>{run.prompt}</h1>
          <Badge className="hidden shrink-0 gap-1.5 sm:inline-flex" variant={RUN_STATUS_TONES[run.status]}>
            <span className={cn("size-1.5 rounded-full bg-current", run.status === "running" && "motion-safe:animate-pulse")} aria-hidden />
            {RUN_STATUS_LABELS[run.status]}
          </Badge>
        </>
      ) : (
        <Skeleton className="h-4 w-56" />
      )}
      <button
        type="button"
        aria-label={copied ? "Link copied" : "Copy link to this run"}
        title={copied ? "Copied" : "Copy link"}
        onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true))}
        className="group ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ds-fg transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ds-accent"
      >
        {copied ? <IconCheck className="size-4" aria-hidden /> : <IconLink className="size-4 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />}
      </button>
    </div>
  );
}

const TABS = [
  { label: "Overview", path: "" },
  { label: "Task board", path: "/board" },
  { label: "Agent reports", path: "/details" },
  { label: "Ask", path: "/chat" },
  { label: "Library", path: "/librarian" },
];

/** Pill tabs between the run's pages, with room on the right for a page's own control. */
export function RunTabs({ active = "", id, trailing }: { active?: string; id: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <nav aria-label="Run sections" className="-mx-1 flex gap-2 overflow-x-auto px-1">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            href={`/runs/${id}${tab.path}`}
            aria-current={tab.path === active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ds-accent",
              tab.path === active ? "border-transparent bg-ds-card-3 text-ds-fg" : "border-border text-ds-fg-sec hover:bg-ds-hover hover:text-ds-fg",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {trailing}
    </div>
  );
}

/** A top-right button that shows or hides a page's side panel. */
export function PanelToggle({ label, onToggle, open }: { label: string; onToggle: () => void; open: boolean }) {
  return (
    <button
      type="button"
      aria-label={`${open ? "Hide" : "Show"} ${label}`}
      title={`${open ? "Hide" : "Show"} ${label}`}
      aria-pressed={open}
      onClick={onToggle}
      className={cn(
        "group flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-ds-fg transition-colors hover:bg-ds-hover focus-visible:outline-2 focus-visible:outline-ds-accent",
        open && "bg-ds-card-3",
      )}
    >
      <IconLayoutSidebarRight className={cn("size-4 transition-opacity group-hover:opacity-100", !open && "opacity-60")} aria-hidden />
    </button>
  );
}

/**
 * Every page of a run: the top bar, the tabs, then the page's own content. The tabs sit in one fixed
 * container so they never shift when you switch pages; `width` caps the content, left-aligned under them.
 */
export function RunPage({
  active,
  children,
  fill = false,
  id,
  run,
  trailing,
  width = "max-w-7xl",
}: {
  active?: string;
  children: ReactNode;
  /** Lock the page to the viewport and give the content the rest of its height, for pages that scroll in parts. */
  fill?: boolean;
  id: string;
  run?: Run;
  trailing?: ReactNode;
  width?: string;
}) {
  if (fill) {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <RunTopBar run={run} />
        <div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 flex-col px-4 md:px-6">
          <RunTabs active={active} id={id} trailing={trailing} />
          <div className={cn("min-h-0 flex-1 pb-4", width)}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <RunTopBar run={run} />
      <div className="mx-auto w-full max-w-[100rem] px-4 md:px-6">
        <RunTabs active={active} id={id} trailing={trailing} />
        <div className={cn("pb-12", width)}>{children}</div>
      </div>
    </>
  );
}
