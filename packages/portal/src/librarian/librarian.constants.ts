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

export const KIND_LABELS: Record<EventKind, string> = {
  asked: "agent asked",
  handed: "factory handed over",
  limit: "limit",
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
export const SHELVES: { label: string; pattern: ClothPatternKind; prefixes: string[] }[] = [
  { label: "House standards", pattern: "grid", prefixes: ["zt-design-system"] },
  { label: "Interface", pattern: "diamonds", prefixes: ["antd", "ant-design-icons", "react-router", "dayjs"] },
  { label: "Server & data", pattern: "chevrons", prefixes: ["express", "better-sqlite3"] },
  { label: "Build & test", pattern: "rings", prefixes: ["vite", "vitest", "node-test", "supertest"] },
];

export const GENERAL_SHELF = "General collection";
export const GENERAL_PATTERN: ClothPatternKind = "grid";

/** The Motion Passport's four pressed cover patterns; each shelf presses its own. */
export type ClothPatternKind = "grid" | "diamonds" | "chevrons" | "rings";

/**
 * Cloth bindings for books, after the animations.dev Motion Passport. `cloth` is the
 * cover gradient, its bright stripe near the left edge the hinge. Inks keep spine
 * titles at 4.5:1 or better, so the bright cloths are lettered dark, not white.
 */
export const BINDINGS: {
  base: string;
  cloth: string;
  /** RGBA (0–1) of the shadow inside a pressed pattern's creases, in the cloth's own hue. */
  crease: [number, number, number, number];
  emboss: string;
  ink: string;
  /** Opacity of the white lip a pressed crease catches light on. */
  lip: number;
}[] = [
  {
    base: "#ffc412",
    crease: [1, 0.455, 0.067, 0.3],
    lip: 0.25,
    cloth: "linear-gradient(90deg,#ffc412 0%,#ffc813 1.62%,#ffc412 2.62%,#ffbe10 4.82%,#ffc412 63.33%)",
    emboss: "0 1px 1px #fff5",
    ink: "#6b4200",
  },
  {
    base: "#ff6038",
    crease: [0.63, 0, 0, 0.3],
    lip: 0.25,
    cloth: "linear-gradient(90deg,#ff6038 0%,#ff7451 1.62%,#ff6a38 2.62%,#ff4c1f 4.82%,#ff6038 63.33%)",
    emboss: "0 1px 1px #fff4",
    ink: "#4a0f00",
  },
  {
    base: "#24a7f3",
    crease: [0.012, 0.09, 0.53, 0.2],
    lip: 0.25,
    cloth: "linear-gradient(90deg,#1093df 0%,#2aadfa 1.62%,#27b0ff 2.62%,#04a1fc 4.82%,#24a7f3 63.33%)",
    emboss: "0 1px 1px #fff4",
    ink: "#06294a",
  },
  {
    base: "#e1ddd8",
    crease: [0.33, 0.27, 0.21, 0.18],
    lip: 0.5,
    cloth: "linear-gradient(90deg,#d8d4ce 0%,#e8e5df 1.62%,#e3dfda 2.62%,#d7d1c9 4.82%,#e1ddd8 63.33%)",
    emboss: "0 1px 1px #ffffff80",
    ink: "#534635",
  },
  {
    base: "#333237",
    crease: [0, 0, 0, 0.35],
    lip: 0.08,
    cloth: "linear-gradient(90deg,#333237 0%,#4b4954 1.62%,#37353e 2.62%,#262529 4.82%,#333237 63.33%)",
    emboss: "0 -1px 1px #0003",
    ink: "#a7acbe",
  },
  {
    base: "#875b42",
    crease: [0.32, 0.075, 0, 0.25],
    lip: 0.16,
    cloth: "linear-gradient(90deg,#875b42 0%,#8d5b3f 1.62%,#7d543d 2.62%,#6d4629 4.82%,#875b42 63.33%)",
    emboss: "0 -1px 1px #52130033",
    ink: "#fbe3c4",
  },
];

/** Plain-English names for reference modules; the catalog only knows their folder slugs. */
export const MODULE_TITLES: Record<string, string> = {
  "express-spa-server": "Node API server",
  "zt-app-shell": "ZT app layout",
};

/** Stocks the documentation stacks; pass library names to sync only those. */
export const SYNC_DOCS_COMMAND = "bun packages/factory/scripts/librarian-sync-docs.ts";
