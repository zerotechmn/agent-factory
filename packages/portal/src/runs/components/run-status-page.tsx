import { useEffect, useState } from "react";
import { Link } from "wouter";

import { PLANNED_STAGES, REDIRECT_DELAY_MS, RUN_STATUS_LABELS, STAGE_STATUS_ICONS } from "../runs.constants";
import { useRun } from "../runs.hooks";
import type { Run, Stage } from "../runs.types";
import { formatUsd, percentOf } from "../runs.utils";

export function RunStatusPage({ id }: { id: string }) {
  const { data: run, error, isLoading } = useRun(id);
  const [redirectCancelled, setRedirectCancelled] = useState(false);
  const live = run?.appUrl && (run.status === "deployed" || run.status === "deployed_partial");

  useEffect(() => {
    if (!live || redirectCancelled || !run?.appUrl) return;
    const timer = setTimeout(() => window.location.assign(run.appUrl!), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [live, redirectCancelled, run?.appUrl]);

  if (isLoading) return <Shell><p className="text-stone-500">Loading…</p></Shell>;
  if (error || !run) {
    return (
      <Shell>
        <p className="text-red-700">{error instanceof Error ? error.message : "Run not found"}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{RUN_STATUS_LABELS[run.status]}</h1>
        <Link href={`/runs/${run.id}/details`} className="text-sm text-stone-600 underline underline-offset-4">
          Inspect agent reports
        </Link>
      </div>
      <p className="mt-2 line-clamp-3 text-stone-600">{run.prompt}</p>

      {live && <LiveBanner appUrl={run.appUrl!} onCancel={() => setRedirectCancelled(true)} redirecting={!redirectCancelled} />}
      {run.status === "queued" && run.queuePosition !== null && (
        <p className="mt-6 rounded-md bg-stone-100 p-3 text-sm">Waiting in queue — position {run.queuePosition}.</p>
      )}
      {run.stopReason && (
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{run.stopReason}</p>
      )}

      <BudgetBar run={run} />
      <StageList run={run} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">← New app</Link>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function LiveBanner({ appUrl, onCancel, redirecting }: { appUrl: string; onCancel: () => void; redirecting: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="font-medium text-emerald-900">Your app is live.</p>
      <a href={appUrl} className="mt-1 block break-all text-emerald-800 underline underline-offset-4">{appUrl}</a>
      {redirecting && (
        <p className="mt-2 text-sm text-emerald-800">
          Redirecting… <button type="button" onClick={onCancel} className="underline">stay here</button>
        </p>
      )}
    </div>
  );
}

function BudgetBar({ run }: { run: Run }) {
  return (
    <div className="mt-8">
      <div className="flex justify-between text-sm text-stone-600">
        <span>Spend</span>
        <span>{formatUsd(run.costUsd)} of {formatUsd(run.budgetUsd)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-stone-800 transition-all" style={{ width: `${percentOf(run.costUsd, run.budgetUsd)}%` }} />
      </div>
    </div>
  );
}

function StageList({ run }: { run: Run }) {
  // Show executed stages, then the not-yet-started part of the planned sequence.
  const started = new Set(run.stages.map((stage) => stage.label));
  const done = run.status !== "queued" && run.status !== "running";
  const pending = done ? [] : PLANNED_STAGES.filter((label) => !started.has(label));

  return (
    <ol className="mt-8 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {run.stages.map((stage) => <StageRow key={stage.seq} stage={stage} />)}
      {pending.map((label) => (
        <li key={label} className="flex items-center gap-3 px-4 py-3 text-stone-400">
          <span className="w-4 text-center">·</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  const tone =
    stage.status === "succeeded" ? "text-emerald-700" : stage.status === "running" ? "text-stone-900" : "text-red-700";
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`w-4 text-center ${tone} ${stage.status === "running" ? "animate-pulse" : ""}`}>
          {STAGE_STATUS_ICONS[stage.status]}
        </span>
        <span className="flex-1">{stage.label}</span>
        <span className="text-sm tabular-nums text-stone-500">{formatUsd(stage.costUsd)}</span>
      </div>
      {stage.error && <p className="mt-1 pl-7 text-sm text-red-700 line-clamp-2">{stage.error}</p>}
    </li>
  );
}
