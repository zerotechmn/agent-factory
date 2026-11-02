import { fileURLToPath } from "node:url";

import type { GateStep } from "../pipeline/pipeline.gate";
import type { AgentStageKey } from "../pipeline/pipeline.types";

export const LIBRARIAN_SERVER = "librarian";

/** spec: this run's PRD/test plan by id · lessons: past fixes · docs: pinned framework docs · catalog: proven modules. */
export const LIBRARIAN_TOOLSETS = ["spec", "lessons", "docs", "catalog"] as const;

export type LibrarianToolset = (typeof LIBRARIAN_TOOLSETS)[number];

export const TOOLSET_TOOLS: Record<LibrarianToolset, string[]> = {
  catalog: ["catalog_search", "catalog_get"],
  docs: ["docs_search", "docs_read"],
  lessons: ["lessons_search"],
  spec: ["spec_get", "spec_trace"],
};

/**
 * Fixed per stage, so a session's tool list (and with it the cached system
 * prompt) never changes mid-session. Document stages that only transform
 * the prompt into a spec get nothing: they have no API to guess.
 */
export const STAGE_TOOLSETS: Record<AgentStageKey, LibrarianToolset[]> = {
  architecture: ["lessons", "docs", "catalog"],
  deployment: ["lessons"],
  development: ["spec", "lessons", "docs", "catalog"],
  requirements: [],
  research: [],
  review: ["spec", "docs"],
  testCases: [],
  testing: ["spec", "lessons"],
  uiDesign: ["docs"],
};

/**
 * Every call is one more model turn re-reading the cached context, so an
 * agent that keeps searching instead of working gets cut off. The developer
 * works longest and touches the most APIs, so it gets the most.
 */
export const STAGE_CALL_LIMITS: Record<AgentStageKey, number> = {
  architecture: 8,
  deployment: 8,
  development: 20,
  requirements: 0,
  research: 0,
  review: 8,
  testCases: 0,
  testing: 8,
  uiDesign: 8,
};

/** Per tool result; docs are pre-chunked to fit, so a section is never cut mid-way. */
export const RESULT_MAX_CHARS = 3_000;

export const SEARCH_LIMIT = 5;

/** How many of the most frequent lessons go straight into the developer's build prompt. */
export const PROMPT_LESSON_LIMIT = 5;

/** A lesson field longer than this is a log dump, not a lesson. */
export const LESSON_FIELD_MAX_CHARS = 600;

/** Where a lesson's problem showed up: a verify step, or a blocking review. */
export const LESSON_STEPS = ["tests", "build", "run", "health", "smoke", "ui", "review"] as const satisfies readonly (GateStep | "review")[];

export type LessonStep = (typeof LESSON_STEPS)[number];

/** Curated content shipped with the factory: docs/<library>@<version>/… and catalog/<item>/… */
export const LIBRARY_DIR = fileURLToPath(new URL("../../librarian", import.meta.url));
