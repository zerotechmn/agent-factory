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
  // The tester works from the contract alone; looking at lessons or docs would only invite guessing past it.
  acceptance: [],
  architecture: ["lessons", "docs", "catalog"],
  deployment: ["lessons"],
  development: ["spec", "lessons", "docs", "catalog"],
  prdReview: [],
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
  acceptance: 0,
  architecture: 8,
  deployment: 8,
  development: 20,
  prdReview: 0,
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

/** Lessons matched to one failure, pushed into a repair prompt or attached to a failing command. */
export const FAILURE_LESSON_LIMIT = 3;

/** Lessons read before ranking by stack: enough that a stack-specific one isn't lost behind generic ones. */
export const RANKING_POOL = 30;

/**
 * Hooks attach knowledge to tool results the agent reads anyway (no extra
 * turn), but every attachment still adds tokens to the session, so a session
 * gets only a few, each one small.
 */
export const HOOK_LIMIT_PER_SESSION = 6;

export const HOOK_MAX_CHARS = 1_200;

/**
 * Technology words looked for in the architecture's stack, matched to lesson
 * tags and doc libraries. Longer names first so "better-sqlite3" wins over "sqlite".
 */
export const STACK_TERMS = [
  "better-sqlite3",
  "react-router",
  "node:test",
  "playwright",
  "supertest",
  "express",
  "fastify",
  "vitest",
  "sqlite",
  "python",
  "flask",
  "fastapi",
  "dayjs",
  "react",
  "antd",
  "vite",
  "jest",
  "hono",
  "bun",
  "node",
  "go",
] as const;

/** A lesson field longer than this is a log dump, not a lesson. */
export const LESSON_FIELD_MAX_CHARS = 600;

/** Where a lesson's problem showed up: a verify step, or a blocking review. */
export const LESSON_STEPS = ["tests", "build", "run", "health", "smoke", "ui", "acceptance", "review"] as const satisfies readonly (GateStep | "review")[];

export type LessonStep = (typeof LESSON_STEPS)[number];

/**
 * Docs that live elsewhere in the factory, indexed under their own library
 * name. The ZT design system is loaded whole as a skill; indexed by section,
 * review and fix agents can look up "§9 states" without re-reading 27 KB.
 */
export const EXTRA_DOC_FILES: { file: string; path: string }[] = [
  {
    file: fileURLToPath(new URL("../../skills-plugin/skills/zt-design-system/SKILL.md", import.meta.url)),
    path: "zt-design-system/skill.md",
  },
];

/** Curated content shipped with the factory: docs/<library>@<version>/… and catalog/<item>/… */
export const LIBRARY_DIR = fileURLToPath(new URL("../../librarian", import.meta.url));
