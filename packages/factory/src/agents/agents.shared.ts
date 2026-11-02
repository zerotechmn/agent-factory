import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

import { LIBRARIAN_SERVER, type LibrarianToolset } from "../librarian/librarian.constants";
import { formatLessons } from "../librarian/librarian.service";
import type { Lesson } from "../librarian/librarian.types";
import type { DevSlice } from "./development/development.slices";
import type { GateResult } from "../pipeline/pipeline.gate";
import type { AgentStageKey, DesignSystem } from "../pipeline/pipeline.types";

/** An earlier part's summary, handed to the parts after it. */
export type DevPartSummary = { featureIds: string[]; id: string; knownGaps: string[]; notes: string; screens: { path: string | null; screenId: string }[] };

export type DevPartContext =
  | { kind: "scaffold" }
  | { kind: "feature"; previous: DevPartSummary[]; slice: DevSlice }
  | { kind: "finish"; previous: DevPartSummary[] };

export type StageContext = {
  allowanceUsd: number;
  appPort: number;
  appUrl: string;
  /** Whether the browser checks test phone width as well as desktop. */
  checkMobile: boolean;
  designSystem: DesignSystem;
  /**
   * Set when the developer builds the app in parts: which part this session
   * is, its slice of the spec for a feature part, and what earlier parts left.
   */
  devPart: DevPartContext | null;
  /** Present when development is re-run to fix verify, triage or review findings. */
  fix: { attempt: number; gate: GateResult | null; review: unknown; triage: unknown } | null;
  /** The verify result a repair agent (testing triage, deployment repair) is asked to act on. */
  gate: GateResult | null;
  /** Latest successful handoff per stage. Never contains REPORT.md prose. */
  handoffs: Partial<Record<AgentStageKey, unknown>>;
  /** Proven lessons the factory picked for this step: by stack for a build, by failure for a repair. */
  lessons: Lesson[];
  /** What the librarian holds, listed in the prompts of stages that choose libraries or write modules. */
  libraryIndex: { catalog: { name: string; summary: string }[]; docs: string[] } | null;
  /** Librarian tools this stage can call; empty when the librarian is off or the stage has none. */
  librarianToolsets: LibrarianToolset[];
  /** Set while a deployed app is being revised from customer feedback. */
  revision: { changes: string[]; feedback: string; n: number } | null;
  /** The customer's answers and feedback, rendered for the prompt; null when there are none. */
  customerInput: string | null;
  /** Problems the factory found in this agent's previous output, for it to correct. */
  repairIssues: string[] | null;
  /** Present on re-reviews: only the changes since the last review need reading. */
  rereview: { diffRange: string; previousFindings: unknown } | null;
  /** True when an earlier session of this agent is resumed, so its earlier context is already loaded. */
  resumed: boolean;
  runId: string;
  stageDir: string;
  userPrompt: string;
  workspaceDir: string;
};

export type AgentDefinition<Schema extends z.ZodObject = z.ZodObject> = {
  allowedTools: string[];
  buildPrompt: (ctx: StageContext) => string;
  /** Doc-only stages run in their own folder; code stages run in the workspace. */
  cwd: (ctx: StageContext) => string;
  mcpServers?: (ctx: StageContext) => Record<string, McpSdkServerConfigWithInstance>;
  /**
   * When set, the factory renders REPORT.md from the handoff and the agent is
   * not asked for a separate prose report, which saves its output tokens and
   * guarantees a fixed layout (used for the PRD template).
   */
  renderReport?: (handoff: unknown) => string;
  role: string;
  /**
   * "doc" agents write documents and barely use tools, so they get a short
   * system prompt instead of the full Claude Code preset, saving its tokens on
   * every turn. "code" agents work in the workspace and keep the preset.
   */
  runtime: "code" | "doc";
  schema: Schema;
};

export const CODE_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "TodoWrite"];
export const READ_TOOLS = ["Read", "Glob", "Grep"];

/** Shared rules every agent sees, appended to the Claude Code system prompt. */
export function systemPromptFor(
  role: string,
  ctx: Pick<StageContext, "allowanceUsd" | "appPort" | "librarianToolsets">,
  runtime: AgentDefinition["runtime"] = "code",
): string {
  return `You are the ${role} agent in an automated software factory that turns a user's prompt into a deployed web application.

Operating rules:
- You run unattended. Never ask questions; make sensible assumptions and record them.
- You have a hard spend limit of about $${ctx.allowanceUsd.toFixed(2)} for this step. Work efficiently: avoid re-reading files you already know and avoid unnecessary exploration.
- Your final answer must be the structured output requested. Its "reportMarkdown" field is read by humans auditing the factory: explain decisions, trade-offs and anything incomplete, concisely.
${runtime === "code" ? WORKING_RULES : ""}${librarianNote(ctx.librarianToolsets)}
Execution environment (where code is built and tested): Debian Linux container with Node.js 22 + npm, Bun, Python 3 + pip/venv, Go, git and curl. Internet is available for package installs. There is NO Docker daemon here; never run docker commands.

Application contract every generated app must satisfy:
- A Dockerfile at the workspace root that builds and runs the whole app as ONE container (no docker-compose, no external services, no API keys).
- The server listens on 0.0.0.0 and the port from the PORT environment variable (default ${ctx.appPort}).
- GET /health returns HTTP 200 once the app is ready.
- Persistent data uses SQLite or files under /data, or memory if persistence is unneeded.
- The UI is served by the same server at "/".`;
}

/** Pushed lessons under a heading that says why this agent is seeing them; empty when there are none. */
export function lessonsBlock(heading: string, lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  return `\n## ${heading}\n\n${formatLessons(lessons)}\n`;
}

/**
 * What the librarian holds. The docs are pinned to one major per library, so
 * an app built on those majors gets docs that match its code exactly.
 */
export function libraryBlock(index: StageContext["libraryIndex"], { catalogHint }: { catalogHint: string }): string {
  if (!index || (index.docs.length === 0 && index.catalog.length === 0)) return "";
  const docs = index.docs.length ? `Version-pinned docs (library@major): ${index.docs.join(", ")}.` : "";
  const catalog = index.catalog.length
    ? `\nProven modules in the catalog (${catalogHint}):\n${index.catalog.map((c) => `- ${c.name}: ${c.summary}`).join("\n")}`
    : "";
  return `\n## Factory library\n\n${docs}${catalog}\n`;
}

export function jsonBlock(title: string, value: unknown): string {
  // Compact on purpose: indentation was ~25% of every spec's characters, and
  // these blocks are re-read on every turn of every agent's session.
  return `## ${title}\n\n\`\`\`json\n${JSON.stringify(value ?? null)}\n\`\`\``;
}

/**
 * Concrete "when X, call Y" rules. "Use it when unsure" got almost no calls:
 * models rarely feel unsure, and guessing an API is exactly what costs a fix
 * round later.
 */
const LIBRARIAN_RULES: Record<LibrarianToolset, string> = {
  catalog:
    "Before writing an app shell, a list/form/detail page, a server bootstrap or a Dockerfile: catalog_search for a proven module, and copy a match with catalog_get instead of writing it from scratch.",
  docs:
    "Before using a component, hook, prop or config option of a documented library (antd, react-router, vite, vitest, better-sqlite3, node:test and others) that you haven't used yet in this step: docs_search it. Look up all the components of one screen in a single turn.",
  lessons: "Before debugging any failure (test, build, start, browser check): lessons_search with the error message. Earlier runs may have fixed the same thing.",
  spec: "When code, a test or a finding names a spec id you haven't read in full (F-, AC-, S-, BRL-, TC-): spec_get it. Use spec_trace to see what a change affects or which tests cover a criterion.",
};

/** Calls cost a turn each, so the rules come with a reminder to batch and a known limit. */
function librarianNote(toolsets: LibrarianToolset[]): string {
  if (toolsets.length === 0) return "";
  return `- The factory librarian (mcp__${LIBRARIAN_SERVER}__* tools) holds docs, lessons and specs you would otherwise guess at. Follow these rules; when several lookups are due, make them as parallel tool calls in one turn (each turn costs money, and a step has a call limit):
${toolsets.map((set) => `  - ${LIBRARIAN_RULES[set]}`).join("\n")}
- The factory may add "Librarian:" notes to a tool result (matching lessons after a failure, doc ids after an import). Read them; they are from earlier runs of this factory.
`;
}

/**
 * Pacing rules for agents that run commands. The prompt cache expires after
 * 5 idle minutes, and the next turn then re-writes the whole context: up to
 * ~150k tokens (~$0.70 on Opus) in runs ujpp45zvwf and nybwpubcur, after a
 * long wait on a background install and after one very long file write.
 */
const WORKING_RULES = `- Keep every step short: no single command should need more than about 2 minutes, and never wait on a long background task. A pause of more than 5 minutes makes the whole session context expensive to resume.
- Write large files in parts of at most about 300 lines per write, appending or editing, rather than one huge write.
- Keep command output short: quiet installs, test output filtered to failures and the summary.
`;
