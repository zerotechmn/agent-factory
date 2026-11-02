import { IconCheck, IconCurrencyDollar, IconMinus, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AgentAvatar } from "../../agents/components/agent-avatar";
import { STAGE_DESCRIPTIONS, STAGE_MOODS, STAGE_STATUS_LABELS } from "../runs.constants";
import type { Activity, Stage, StageStatus } from "../runs.types";
import { clockTime, formatDuration, formatUsd } from "../runs.utils";
import { CARD_CLASS } from "./run-card";

/** The stage that matters right now: the one working, or the one that stopped the run. The full sequence is in the top bar's popover. */
export function currentStage(stages: Stage[]): Stage | undefined {
  return stages.find((s) => s.status === "running") ?? stages.filter((s) => s.status === "failed" || s.status === "stopped_budget").at(-1);
}

/** A working stage is just its live activity; a stage that stopped the run keeps its card, with the error. */
export function CurrentStage({ activity, now, stage }: { activity: Activity[]; now: number; stage: Stage }) {
  if (stage.status === "running") return <ActivityLog activity={activity.filter((a) => a.stage === stage.label)} label={`${stage.label} activity`} />;
  return (
    <section aria-label={`${stage.label}, ${STAGE_STATUS_LABELS[stage.status].toLowerCase()}`} className={cn(CARD_CLASS, "p-5")}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--ds-white)] dark:bg-background">
          <AgentAvatar mood={STAGE_MOODS[stage.status]} size={24} stageKey={stage.stageKey} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{stage.label}</span>
            <StatusLabel status={stage.status} />
          </p>
          <p className="text-xs text-ds-fg-sec">{STAGE_DESCRIPTIONS[stage.stageKey]}</p>
        </div>
        <Figures now={now} stage={stage} />
      </div>
      {stage.error && <p className="mt-3 rounded-lg bg-ds-error-soft px-3 py-2 text-sm text-ds-error">{stage.error}</p>}
    </section>
  );
}

const STATUS_ICONS: Record<StageStatus, ReactNode> = {
  failed: <IconX className="size-3.5" aria-hidden />,
  running: <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />,
  skipped: <IconMinus className="size-3.5" aria-hidden />,
  stopped_budget: <IconCurrencyDollar className="size-3.5" aria-hidden />,
  succeeded: <IconCheck className="size-3.5" aria-hidden />,
};

const STATUS_TEXT_TONES: Record<StageStatus, string> = {
  failed: "text-ds-error",
  running: "text-ds-accent",
  skipped: "text-ds-fg-ter",
  stopped_budget: "text-ds-error",
  succeeded: "text-ds-success",
};

/** Colour never carries the state alone: an icon and a word go with it. */
export function StatusLabel({ status }: { status: StageStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", STATUS_TEXT_TONES[status])}>
      {STATUS_ICONS[status]}
      {STAGE_STATUS_LABELS[status]}
    </span>
  );
}

export function Figures({ now, stage }: { now: number; stage: Stage }) {
  return (
    <p className="shrink-0 text-right text-xs tabular-nums text-ds-fg-sec">
      <span className="block text-sm text-ds-fg">{formatDuration(stage.startedAt, stage.finishedAt ? Date.parse(stage.finishedAt) : now)}</span>
      {formatUsd(stage.costUsd)}
    </p>
  );
}

/** The running agent's latest actions, newest first, fading as they age. */
function ActivityLog({ activity, label }: { activity: Activity[]; label: string }) {
  const box = "rounded-md border border-border bg-[var(--ds-white)] px-3 py-2.5 shadow-[var(--ds-shadow-card)] dark:bg-background";
  if (!activity.length) return <p className={cn(box, "text-sm text-ds-fg-sec")} role="group" aria-label={label}>Thinking…</p>;
  const [latest, ...earlier] = activity;
  return (
    <div className={cn(box, "space-y-1 font-mono text-xs")} role="group" aria-label={label}>
      <p
        key={`${latest!.at}-${latest!.text}`}
        className="flex items-center gap-2 text-ds-fg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
        aria-live="polite"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-ds-accent motion-safe:animate-pulse" aria-hidden />
        <span className="truncate">{latest!.text}</span>
      </p>
      <ul className="space-y-1">
        {earlier.slice(0, 4).map((a, index) => (
          <li key={`${a.at}-${a.text}`} className={cn("flex gap-2 text-ds-fg-sec", index > 1 && "opacity-60")}>
            <time className="shrink-0 tabular-nums text-ds-fg-ter" dateTime={a.at}>{clockTime(a.at)}</time>
            <span className="truncate">{a.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
