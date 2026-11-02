import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AgentAvatar } from "../../agents/components/agent-avatar";
import { Badge } from "../../design-system";
import { RunLibrarianSummary } from "../../librarian/components/run-librarian-summary";
import { BOARD_COLUMNS, DESIGN_SYSTEM_OPTIONS, RUN_STATUS_LABELS, RUN_STATUS_TONES, STAGE_MOODS, TERMINAL_STATUSES } from "../runs.constants";
import { useBoard } from "../runs.hooks";
import type { Run } from "../runs.types";
import { formatDuration, formatUsd, percentOf, timeAgo } from "../runs.utils";
import { RunCard } from "./run-card";

/** Numbers that matter while you wait, each linking to its detail page. */
export function RunRail({ run }: { run: Run }) {
  const live = !TERMINAL_STATUSES.includes(run.status);
  return (
    <>
      <PropertiesCard run={run} />
      <SpendCard run={run} />
      <TasksCard live={live} runId={run.id} />
      <RunLibrarianSummary id={run.id} live={live} />
    </>
  );
}

/** Label on the left, value on the right, one fact per row. */
function Property({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 py-1.5 text-sm">
      <dt className="text-ds-fg-sec">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">{children}</dd>
    </div>
  );
}

function PropertiesCard({ run }: { run: Run }) {
  const now = Date.now();
  const ended = TERMINAL_STATUSES.includes(run.status);
  const stage = run.stages.find((s) => s.status === "running") ?? run.stages.at(-1);
  const lastFinish = Math.max(...run.stages.map((s) => (s.finishedAt ? Date.parse(s.finishedAt) : 0)), 0);
  const until = ended && lastFinish > 0 ? lastFinish : now;
  const designSystem = DESIGN_SYSTEM_OPTIONS.find((o) => o.value === run.designSystem)?.label;

  return (
    <RunCard title="Properties">
      <dl className="mt-2">
        <Property label="Status">
          <Badge variant={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
        </Property>
        <Property label="Stage">
          {stage ? (
            <>
              <AgentAvatar mood={STAGE_MOODS[stage.status]} size={18} stageKey={stage.stageKey} />
              <span className="truncate">{stage.label}</span>
            </>
          ) : (
            <span className="text-ds-fg-sec">Not started</span>
          )}
        </Property>
        <Property label="Started">{timeAgo(run.createdAt, now)}</Property>
        <Property label={ended ? "Took" : "Running for"}>
          <span className="tabular-nums">{formatDuration(run.createdAt, until)}</span>
        </Property>
        {designSystem && <Property label="Design">{designSystem}</Property>}
        {run.appUrl && (
          <Property label="App">
            <a href={run.appUrl} className="truncate underline underline-offset-4" title={run.appUrl}>{new URL(run.appUrl).host}</a>
          </Property>
        )}
        <Property label="Run">
          <code className="truncate font-mono text-xs" title={run.id}>{run.id}</code>
        </Property>
      </dl>
    </RunCard>
  );
}

function SpendCard({ run }: { run: Run }) {
  const used = percentOf(run.costUsd, run.budgetUsd);
  const left = Math.max(run.budgetUsd - run.costUsd, 0);
  return (
    <RunCard title="Spend">
      <dl className="mt-2 tabular-nums">
        <Property label="Spent">{formatUsd(run.costUsd)}</Property>
        <Property label="Budget">{formatUsd(run.budgetUsd)}</Property>
        <Property label="Left">{formatUsd(left)}</Property>
      </dl>
      <div
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used)}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ds-line"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", used >= 100 ? "bg-ds-error" : used >= 80 ? "bg-ds-accent" : "bg-ds-fg")}
          style={{ width: `${used}%` }}
        />
      </div>
    </RunCard>
  );
}

/** Cards per column as one stacked bar; the full board is a click away. */
function TasksCard({ live, runId }: { live: boolean; runId: string }) {
  const { data: board } = useBoard(runId, { live });
  if (!board || board.cards.length === 0) return null;

  const total = board.cards.length;
  const counts = BOARD_COLUMNS.map((column) => ({ ...column, count: board.cards.filter((c) => c.column === column.value).length }));
  const verified = counts.find((c) => c.value === "verified")?.count ?? 0;

  return (
    <RunCard href={`/runs/${runId}/board`} linkLabel="Board" title="Tasks">
      <p className="mt-2 text-2xl tabular-nums">
        {verified}
        <span className="text-base text-ds-fg-sec"> of {total}</span>
      </p>
      <p className="text-xs text-ds-fg-sec">verified</p>
      <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-ds-line" aria-hidden>
        {counts.map((c) => (c.count ? <div key={c.value} className={cn("transition-[width] duration-300", c.tone)} style={{ width: `${percentOf(c.count, total)}%` }} /> : null))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ds-fg-sec">
        {counts.map((c) => (
          <li key={c.value} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", c.tone)} aria-hidden />
            {c.label}
            <span className="ml-auto tabular-nums text-ds-fg">{c.count}</span>
          </li>
        ))}
      </ul>
    </RunCard>
  );
}
