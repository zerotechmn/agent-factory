import type { BoardColumn, CardKind, DesignSystem, RunStatus, StageStatus } from "./runs.types";

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
export const PLANNED_STAGES = ["Research", "Requirements", "Test cases", "Architecture", "UI/UX design", "Development", "Verify", "Review"];

export const REDIRECT_DELAY_MS = 4_000;

export const BOARD_COLUMNS: { description: string; label: string; tone: string; value: BoardColumn }[] = [
  { description: "Planned by the PRD and test plan", label: "To do", tone: "bg-stone-400", value: "todo" },
  { description: "The developer is working on it", label: "In progress", tone: "bg-sky-500", value: "doing" },
  { description: "The developer says it works; not yet verified", label: "Built", tone: "bg-indigo-500", value: "built" },
  { description: "Proven by the test run, HTTP checks or browser checks", label: "Verified", tone: "bg-emerald-500", value: "verified" },
  { description: "A test, check or browser check failed", label: "Failed", tone: "bg-red-500", value: "failed" },
];

export const BOARD_COLUMN_LABELS = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.value, c.label])) as Record<BoardColumn, string>;

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  feature: "Feature",
  screen: "Screen",
  smoke: "Smoke check",
  test: "Test case",
};

/** Filter chips; smoke checks sit with test cases. */
export const BOARD_FILTERS: { kinds: CardKind[]; label: string; value: string }[] = [
  { kinds: ["feature", "screen", "test", "smoke"], label: "All", value: "all" },
  { kinds: ["feature"], label: "Features", value: "feature" },
  { kinds: ["screen"], label: "Screens", value: "screen" },
  { kinds: ["test", "smoke"], label: "Tests", value: "test" },
];

/** A card moved this recently is highlighted so movement is visible while polling. */
export const RECENT_MOVE_MS = 8_000;

export const DESIGN_SYSTEM_OPTIONS: { description: string; label: string; value: DesignSystem }[] = [
  {
    description: "Ant Design 6 business UI: sidebar, tables, forms, dashboards. Best for internal and admin apps.",
    label: "ZT Design System",
    value: "zt",
  },
  {
    description: "A distinctive look designed for this product. Best for consumer apps, catalogues and landing pages.",
    label: "Custom design",
    value: "custom",
  },
];
