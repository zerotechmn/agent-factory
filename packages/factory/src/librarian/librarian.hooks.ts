import type { HookCallbackMatcher, HookEvent, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";

import { parseTestCounts, parseTestLog } from "../board/board.utils";
import type { AgentStageKey } from "../pipeline/pipeline.types";
import { FAILURE_LESSON_LIMIT, HOOK_LIMIT_PER_SESSION, HOOK_MAX_CHARS } from "./librarian.constants";
import * as LibrarianService from "./librarian.service";
import * as LibrarianStore from "./librarian.store";
import { librarianToolsets } from "./librarian.tools";

// Hooks attach librarian knowledge to a tool result the agent is about to
// read anyway, so the push costs tokens but no extra model turn. They fire at
// the two moments the factory can recognise without the agent asking: a
// command just failed, or a file just started using a documented library.

export type HookState = { injected: number; seen: Set<string> };

export type Hint = { hits: number; key: string; query: string; text: string; tool: "auto:hook-docs" | "auto:hook-lessons" };

const LESSON_HINT_LIMIT = Math.min(2, FAILURE_LESSON_LIMIT);

/** Output that clearly reports a problem, beyond the test-run counts parsed separately. */
const FAILURE_OUTPUT =
  /npm ERR!|error TS\d+|SyntaxError|TypeError|ReferenceError|Cannot find module|ERR_[A-Z_]+|EADDRINUSE|Traceback \(most recent call last\)|ModuleNotFoundError|failed to solve|exited with code [1-9]|Command failed/;

/** Import sources we have docs for, mapped to their docs library prefix. */
const DOC_MODULES: Record<string, string> = {
  "@ant-design/icons": "ant-design-icons",
  antd: "antd",
  "better-sqlite3": "better-sqlite3",
  dayjs: "dayjs",
  express: "express",
  "node:test": "node-test",
  "react-router": "react-router",
  "react-router-dom": "react-router",
  supertest: "supertest",
  vite: "vite",
  vitest: "vitest",
};

/** Named imports worth a lookup of their own (components, hooks); everything else is looked up by module. */
const NAMED_LOOKUP = new Set(["antd", "react-router", "vitest"]);

export function createHookState(): HookState {
  return { injected: 0, seen: new Set() };
}

/** Matching lessons for a command's output, once per distinct failure. */
export function lessonHint(state: HookState, output: string, failed: boolean): Hint | null {
  if (state.injected >= HOOK_LIMIT_PER_SESSION) return null;
  if (!failed && !looksFailed(output)) return null;
  const lines = LibrarianService.errorLines(output, 3);
  if (lines.length === 0) return null;
  const key = `lessons:${lines.join("|")}`;
  if (state.seen.has(key)) return null;
  state.seen.add(key);
  const lessons = LibrarianService.lessonsForOutput(output, LESSON_HINT_LIMIT);
  const query = lines.join(" ");
  if (lessons.length === 0) return { hits: 0, key, query, text: "", tool: "auto:hook-lessons" };
  state.injected += 1;
  return {
    hits: lessons.length,
    key,
    query,
    text: LibrarianService.clip(
      `Librarian: earlier factory runs fixed a similar failure. Check whether it applies before debugging further:\n${LibrarianService.formatLessons(lessons)}`,
      HOOK_MAX_CHARS,
    ),
    tool: "auto:hook-lessons",
  };
}

/** Doc section ids for libraries (and antd components, router hooks) a file starts using. */
export function docHint(state: HookState, content: string): Hint | null {
  if (state.injected >= HOOK_LIMIT_PER_SESSION) return null;
  const lookups = importLookups(content).filter((lookup) => !state.seen.has(lookup.key));
  if (lookups.length === 0) return null;
  const lines: string[] = [];
  for (const lookup of lookups.slice(0, 4)) {
    state.seen.add(lookup.key);
    // A component or hook has its own page (DatePicker → date-picker, useNavigate → use-navigate); search is the fallback.
    const page = lookup.page ? LibrarianStore.pageSections(lookup.library, lookup.page, 2) : [];
    for (const chunk of page.length ? page : LibrarianService.searchDocs(lookup.query, lookup.library).slice(0, 2)) {
      lines.push(`- ${chunk.id} (${chunk.title})`);
    }
  }
  const query = lookups.map((l) => `${l.library}: ${l.query}`).join("; ");
  const key = lookups.map((l) => l.key).join("|");
  if (lines.length === 0) return { hits: 0, key, query, text: "", tool: "auto:hook-docs" };
  state.injected += 1;
  return {
    hits: lines.length,
    key,
    query,
    text: LibrarianService.clip(
      `Librarian: version-pinned docs for what this file uses. Open one with docs_read <id> if you're not certain of the API:\n${[...new Set(lines)].join("\n")}`,
      HOOK_MAX_CHARS,
    ),
    tool: "auto:hook-docs",
  };
}

/** What a file imports from documented libraries, as one lookup per component/hook or per module. */
export function importLookups(content: string): { key: string; library: string; page: string | null; query: string }[] {
  const lookups: { key: string; library: string; page: string | null; query: string }[] = [];
  const pattern = /import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    const module = match[3] ?? match[4] ?? "";
    const library = DOC_MODULES[module];
    if (!library) continue;
    const names = (match[2] ?? "")
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
      .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    if (NAMED_LOOKUP.has(library) && names.length) {
      // FTS keeps "DatePicker" and "useNavigate" as single words, exactly as the docs write them.
      for (const name of names) lookups.push({ key: `docs:${library}:${name}`, library, page: kebab(name), query: name });
    } else {
      lookups.push({ key: `docs:${library}`, library, page: null, query: [module.replace(/^node:/, ""), ...names].join(" ") });
    }
  }
  return lookups;
}

/**
 * The SDK hooks for one stage session, or undefined when the stage has no
 * lessons or docs toolset (or the librarian is off). A hook never throws:
 * an error only means no hint.
 */
export function librarianHooks({
  runId,
  stage,
  stageKey,
}: {
  runId: string;
  stage: string;
  stageKey: AgentStageKey;
}): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const toolsets = librarianToolsets(stageKey);
  const lessons = toolsets.includes("lessons");
  const docs = toolsets.includes("docs");
  if (!lessons && !docs) return undefined;
  const state = createHookState();

  const respond = (event: "PostToolUse" | "PostToolUseFailure", hint: Hint | null): HookJSONOutput => {
    if (!hint) return { continue: true };
    LibrarianStore.logQuery({ at: new Date().toISOString(), hits: hint.hits, query: hint.query.slice(0, 500), runId, stage, tool: hint.tool });
    if (!hint.text) return { continue: true };
    return { continue: true, hookSpecificOutput: { additionalContext: hint.text, hookEventName: event } };
  };
  const guarded = (event: "PostToolUse" | "PostToolUseFailure", make: () => Hint | null): HookJSONOutput => {
    try {
      return respond(event, make());
    } catch (error) {
      console.error("[librarian] hook failed", { message: error instanceof Error ? error.message : String(error), runId, stage });
      return { continue: true };
    }
  };

  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
    PostToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PostToolUse") return { continue: true };
            if (input.tool_name === "Bash") {
              return lessons ? guarded("PostToolUse", () => lessonHint(state, responseText(input.tool_response), false)) : { continue: true };
            }
            return docs ? guarded("PostToolUse", () => docHint(state, writtenText(input.tool_input))) : { continue: true };
          },
        ],
        matcher: "Bash|Write|Edit|MultiEdit",
      },
    ],
  };
  if (lessons) {
    hooks.PostToolUseFailure = [
      {
        hooks: [
          async (input) =>
            input.hook_event_name === "PostToolUseFailure" && !input.is_interrupt
              ? guarded("PostToolUseFailure", () => lessonHint(state, input.error, true))
              : { continue: true },
        ],
        matcher: "Bash",
      },
    ];
  }
  return hooks;
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function looksFailed(output: string): boolean {
  if ((parseTestCounts(output)?.failed ?? 0) > 0) return true;
  if ([...parseTestLog(output).values()].includes("failed")) return true;
  return FAILURE_OUTPUT.test(output);
}

/** Bash results arrive as { stdout, stderr } or plain text depending on the SDK version. */
function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const r = response as { stderr?: unknown; stdout?: unknown };
    const parts = [r.stdout, r.stderr].filter((p): p is string => typeof p === "string");
    if (parts.length) return parts.join("\n");
  }
  return "";
}

/** The code a Write/Edit/MultiEdit put into a file. */
function writtenText(input: unknown): string {
  const i = (input ?? {}) as { content?: unknown; edits?: { new_string?: unknown }[]; new_string?: unknown };
  if (typeof i.content === "string") return i.content;
  if (typeof i.new_string === "string") return i.new_string;
  if (Array.isArray(i.edits)) return i.edits.map((e) => (typeof e.new_string === "string" ? e.new_string : "")).join("\n");
  return "";
}
