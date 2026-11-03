import { PLANNED_STAGES, TERMINAL_STATUSES } from "./runs.constants";
import type { Run, Stage } from "./runs.types";

export function formatUsd(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
}

export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(Math.round((now - Date.parse(iso)) / 1_000), 0);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  return new Date(iso).toLocaleString([], { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(startedAt: string, until: number): string {
  const seconds = Math.max(Math.round((until - Date.parse(startedAt)) / 1_000), 0);
  if (!Number.isFinite(seconds)) return "";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** The built app is reachable: deployed, with an address. */
export function isLive(run: Run): boolean {
  return Boolean(run.appUrl) && (run.status === "deployed" || run.status === "deployed_partial");
}

export type PipelineStep = { key: string; label: string; stage: Stage | null; stageKey: string };

/** Executed stages, then the not-yet-started part of the planned sequence (none once the run has ended). */
export function buildPipeline(run: Run): PipelineStep[] {
  const started = new Set(run.stages.map((stage) => stage.label));
  const pending = TERMINAL_STATUSES.includes(run.status) ? [] : PLANNED_STAGES.filter((stage) => !started.has(stage.label));
  return [
    ...run.stages.map((stage) => ({ key: `stage-${stage.seq}`, label: stage.label, stage, stageKey: stage.stageKey })),
    ...pending.map((stage) => ({ key: `planned-${stage.key}`, label: stage.label, stage: null, stageKey: stage.key })),
  ];
}
