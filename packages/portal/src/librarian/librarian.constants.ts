import type { LessonStep } from "./librarian.types";

export type EventKind = "asked" | "handed" | "limit";

/** Plain words for each logged tool; unknown tools fall back to their name. */
export const TOOL_LABELS: Record<string, { kind: EventKind; label: string }> = {
  "auto:catalog": { kind: "handed", label: "Listed reusable modules" },
  "auto:hook-docs": { kind: "handed", label: "Pointed to documentation after an import" },
  "auto:hook-lessons": { kind: "handed", label: "Lessons after a failed command" },
  "auto:lessons": { kind: "handed", label: "Handed over lessons" },
  catalog_get: { kind: "asked", label: "Copied a proven module" },
  catalog_search: { kind: "asked", label: "Searched reusable modules" },
  docs_read: { kind: "asked", label: "Read documentation" },
  docs_search: { kind: "asked", label: "Looked up documentation" },
  lessons_search: { kind: "asked", label: "Checked past lessons" },
  limit: { kind: "limit", label: "Lookup limit reached" },
  spec_get: { kind: "asked", label: "Looked up the spec" },
  spec_trace: { kind: "asked", label: "Traced the spec" },
};

export const KIND_STYLES: Record<EventKind, { label: string; tone: string }> = {
  asked: { label: "Agent asked", tone: "bg-sky-50 text-sky-900 ring-sky-200" },
  handed: { label: "Factory handed over", tone: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  limit: { label: "Limit", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
};

/** Where a lesson's problem was caught. */
export const STEP_LABELS: Record<LessonStep, string> = {
  acceptance: "Acceptance tests",
  build: "Image build",
  health: "Health check",
  review: "Code review",
  run: "Container start",
  smoke: "Smoke checks",
  tests: "Tests",
  ui: "Browser check",
};

/** Short codes for call numbers on lesson index cards, e.g. "UI-0003". */
export const STEP_CODES: Record<LessonStep, string> = {
  acceptance: "ACC",
  build: "BLD",
  health: "HLT",
  review: "REV",
  run: "RUN",
  smoke: "SMK",
  tests: "TST",
  ui: "UI",
};

/**
 * Shelves of the documentation stacks, matched by library name prefix.
 * Anything unlisted lands on "General collection", so new docs still show.
 */
export const SHELVES: { label: string; prefixes: string[] }[] = [
  { label: "House standards", prefixes: ["zt-design-system"] },
  { label: "Interface", prefixes: ["antd", "ant-design-icons", "react-router", "dayjs"] },
  { label: "Server & data", prefixes: ["express", "better-sqlite3"] },
  { label: "Build & test", prefixes: ["vite", "vitest", "node-test", "supertest"] },
];

export const GENERAL_SHELF = "General collection";

/** Cloth-binding colours for book spines; all dark enough for white lettering (≥ 7:1). */
export const SPINE_COLORS = ["#7f1d1d", "#14532d", "#1e3a8a", "#78350f", "#4c1d95", "#134e4a", "#831843", "#3f3f46", "#713f12", "#164e63"];
