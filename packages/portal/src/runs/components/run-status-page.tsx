import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

import { AgentAvatar } from "../../agents/components/agent-avatar";
import { Alert, buttonVariants } from "../../design-system";
import {
  BOARD_COLUMNS,
  PLANNED_STAGES,
  REDIRECT_DELAY_MS,
  RUN_STATUS_LABELS,
  STAGE_DESCRIPTIONS,
  STAGE_MOODS,
  STAGE_STATUS_ICONS,
  TERMINAL_STATUSES,
} from "../runs.constants";
import { useBoard, useRun } from "../runs.hooks";
import { RunLibrarianSummary } from "../../librarian/components/run-librarian-summary";
import { RunFeedback } from "./run-feedback";
import { RunQuestions } from "./run-questions";
import type { Activity, Run, Stage } from "../runs.types";
import { clockTime, formatUsd, percentOf } from "../runs.utils";

export function RunStatusPage({ id }: { id: string }) {
  const { data: run, error, isLoading } = useRun(id);
  const [redirectCancelled, setRedirectCancelled] = useState(false);
  const live = run?.appUrl && (run.status === "deployed" || run.status === "deployed_partial");
  // Redirect only when the build finishes while you watch; coming back later (e.g. to give feedback) stays here.
  const watchedBuild = useRef(false);
  if (run && !TERMINAL_STATUSES.includes(run.status)) watchedBuild.current = true;

  useEffect(() => {
    if (!live || redirectCancelled || !run?.appUrl || !watchedBuild.current) return;
    const timer = setTimeout(() => window.location.assign(run.appUrl!), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [live, redirectCancelled, run?.appUrl]);

  if (isLoading) return <Shell><p className="text-ds-fg-sec">Loading…</p></Shell>;
  if (error || !run) {
    return (
      <Shell>
        <p className="text-ds-error">{error instanceof Error ? error.message : "Run not found"}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="type-md-lg">{RUN_STATUS_LABELS[run.status]}</h1>
        <span className="flex flex-wrap gap-2">
          <Link href={`/runs/${run.id}/board`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Task board</Link>
          <Link href={`/runs/${run.id}/details`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Agent reports</Link>
          <Link href={`/runs/${run.id}/librarian`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Library</Link>
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-ds-fg-sec">{run.prompt}</p>

      {live && (
        <LiveBanner appUrl={run.appUrl!} onCancel={() => setRedirectCancelled(true)} redirecting={!redirectCancelled && watchedBuild.current} />
      )}
      {(live || run.revisions.length > 0) && <RunFeedback canSubmit={Boolean(live)} revisions={run.revisions} runId={run.id} />}
      {run.status === "waiting_customer" && run.questions && <RunQuestions key={run.questions.checkpoint} open={run.questions} runId={run.id} />}
      {run.status === "queued" && run.queuePosition !== null && (
        <Alert className="mt-6">Waiting in queue — position {run.queuePosition}.</Alert>
      )}
      {run.stopReason && (
        <Alert tone="warning" className="mt-6">{run.stopReason}</Alert>
      )}

      <BudgetBar run={run} />
      <BoardSummary run={run} />
      <RunLibrarianSummary id={run.id} live={!TERMINAL_STATUSES.includes(run.status)} />
      <StageList run={run} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-ds-fg-sec transition-colors hover:text-ds-fg">← New app</Link>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function LiveBanner({ appUrl, onCancel, redirecting }: { appUrl: string; onCancel: () => void; redirecting: boolean }) {
  return (
    <Alert tone="success" title="Your app is live." className="mt-6">
      <a href={appUrl} className="block break-all text-ds-fg underline underline-offset-4">{appUrl}</a>
      {redirecting && (
        <p className="mt-2">
          Redirecting… <button type="button" onClick={onCancel} className="cursor-pointer text-ds-fg underline">stay here</button>
        </p>
      )}
    </Alert>
  );
}

function BudgetBar({ run }: { run: Run }) {
  return (
    <div className="mt-8">
      <div className="flex justify-between text-sm text-ds-fg-sec">
        <span>Spend</span>
        <span>{formatUsd(run.costUsd)} of {formatUsd(run.budgetUsd)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ds-card-3">
        <div className="h-full bg-ds-fg transition-all" style={{ width: `${percentOf(run.costUsd, run.budgetUsd)}%` }} />
      </div>
    </div>
  );
}

/** Cards per column as one stacked bar; the full board is a click away. */
function BoardSummary({ run }: { run: Run }) {
  const { data: board } = useBoard(run.id, { live: !TERMINAL_STATUSES.includes(run.status) });
  const total = board?.cards.length ?? 0;
  if (!board || total === 0) return null;
  return (
    <Link href={`/runs/${run.id}/board`} className="mt-6 block rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card p-4 transition-colors hover:bg-ds-card-hover">
      <div className="flex justify-between text-sm text-ds-fg-sec">
        <span>Tasks</span>
        <span className="tabular-nums">{board.cards.filter((c) => c.column === "verified").length} of {total} verified</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-ds-card-3">
        {BOARD_COLUMNS.map((column) => {
          const count = board.cards.filter((c) => c.column === column.value).length;
          return count ? <div key={column.value} className={`${column.tone} transition-all`} style={{ width: `${percentOf(count, total)}%` }} /> : null;
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ds-fg-sec">
        {BOARD_COLUMNS.map((column) => (
          <li key={column.value} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${column.tone}`} />
            {column.label} <span className="tabular-nums">{board.cards.filter((c) => c.column === column.value).length}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

function StageList({ run }: { run: Run }) {
  // Show executed stages, then the not-yet-started part of the planned sequence.
  const started = new Set(run.stages.map((stage) => stage.label));
  const done = TERMINAL_STATUSES.includes(run.status);
  const pending = done ? [] : PLANNED_STAGES.filter((stage) => !started.has(stage.label));
  const now = Date.now();

  return (
    <ol className="mt-8 divide-y divide-ds-line rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card">
      {run.stages.map((stage) => (
        <StageRow
          key={stage.seq}
          activity={run.activity.filter((a) => a.stage === stage.label)}
          now={now}
          stage={stage}
        />
      ))}
      {pending.map((stage) => (
        <li key={stage.key} className="flex items-start gap-3 px-4 py-3 text-ds-fg-ter">
          <AgentAvatar className="opacity-50" mood="waiting" stageKey={stage.key} />
          <span>
            <span className="block">{stage.label}</span>
            <span className="block text-xs">{STAGE_DESCRIPTIONS[stage.key]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageRow({ activity, now, stage }: { activity: Activity[]; now: number; stage: Stage }) {
  const running = stage.status === "running";
  const tone = stage.status === "succeeded" ? "text-ds-success" : running ? "text-ds-fg" : "text-ds-error";
  return (
    <li className={`px-4 py-3 ${running ? "bg-ds-card-warm" : ""}`}>
      <div className="flex items-start gap-3">
        <AgentAvatar mood={STAGE_MOODS[stage.status]} stageKey={stage.stageKey} />
        <span className="min-w-0 flex-1">
          <span className="block">
            {stage.label} <span className={tone}>{STAGE_STATUS_ICONS[stage.status]}</span>
          </span>
          <span className="block text-xs text-ds-fg-sec">{STAGE_DESCRIPTIONS[stage.stageKey]}</span>
        </span>
        <span className="text-right text-sm tabular-nums text-ds-fg-sec">
          {formatUsd(stage.costUsd)}
          <span className="block text-xs">{elapsed(stage.startedAt, stage.finishedAt ? Date.parse(stage.finishedAt) : now)}</span>
        </span>
      </div>
      {running && <ActivityLines activity={activity} />}
      {stage.error && <p className="mt-1 pl-10 text-sm text-ds-error line-clamp-2">{stage.error}</p>}
    </li>
  );
}

/** The running agent's latest actions, newest first, read live from what it does. */
function ActivityLines({ activity }: { activity: Activity[] }) {
  if (!activity.length) return <p className="mt-1 pl-10 text-sm text-ds-fg-sec">Thinking…</p>;
  const [latest, ...earlier] = activity;
  return (
    <div className="mt-1 pl-10">
      <p className="truncate text-sm text-ds-accent" aria-live="polite">{latest!.text}</p>
      <ul className="mt-0.5 space-y-0.5">
        {earlier.slice(0, 4).map((a) => (
          <li key={`${a.at}-${a.text}`} className="truncate text-xs text-ds-fg-sec">
            {clockTime(a.at)} · {a.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function elapsed(startedAt: string, until: number): string {
  const seconds = Math.max(Math.round((until - Date.parse(startedAt)) / 1_000), 0);
  if (!Number.isFinite(seconds)) return "";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
