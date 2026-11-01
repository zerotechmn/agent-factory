import type { RunStatus, StageStatus } from "./runs.types";

export const TERMINAL_STATUSES: RunStatus[] = ["deployed", "deployed_partial", "failed", "failed_budget"];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  deployed: "Deployed",
  deployed_partial: "Deployed with known issues",
  failed: "Failed",
  failed_budget: "Stopped: budget exhausted",
  queued: "Queued",
  running: "Building",
};

export const STAGE_STATUS_ICONS: Record<StageStatus, string> = {
  failed: "✕",
  running: "◌",
  skipped: "–",
  stopped_budget: "$",
  succeeded: "✓",
};

/** The planned happy path, shown greyed out before a stage starts. Repair and fix stages appear only when they run. */
export const PLANNED_STAGES = ["Research", "Requirements", "Test cases", "Design", "Development", "Verify", "Review"];

export const REDIRECT_DELAY_MS = 4_000;
