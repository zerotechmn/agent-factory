import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

import { LIBRARIAN_SERVER, type LibrarianToolset } from "../librarian/librarian.constants";
import type { Lesson } from "../librarian/librarian.types";
import type { GateResult } from "../pipeline/pipeline.gate";
import type { AgentStageKey, DesignSystem } from "../pipeline/pipeline.types";

export type StageContext = {
  allowanceUsd: number;
  appPort: number;
  appUrl: string;
  /** Whether the browser checks test phone width as well as desktop. */
  checkMobile: boolean;
  designSystem: DesignSystem;
  /** Present when development is re-run to fix verify, triage or review findings. */
  fix: { attempt: number; gate: GateResult | null; review: unknown; triage: unknown } | null;
  /** The verify result a repair agent (testing triage, deployment repair) is asked to act on. */
  gate: GateResult | null;
  /** Latest successful handoff per stage. Never contains REPORT.md prose. */
  handoffs: Partial<Record<AgentStageKey, unknown>>;
  /** The most frequent proven lessons for this design system; only the developer's first build gets them. */
  lessons: Lesson[];
  /** Librarian tools this stage can call; empty when the librarian is off or the stage has none. */
  librarianToolsets: LibrarianToolset[];
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

export function jsonBlock(title: string, value: unknown): string {
  // Compact on purpose: indentation was ~25% of every spec's characters, and
  // these blocks are re-read on every turn of every agent's session.
  return `## ${title}\n\n\`\`\`json\n${JSON.stringify(value ?? null)}\n\`\`\``;
}

const LIBRARIAN_NOTES: Record<LibrarianToolset, string> = {
  catalog: "catalog_search / catalog_get: proven modules from earlier apps that passed verify; check before writing a common module from scratch",
  docs: "docs_search / docs_read: version-pinned framework docs; use instead of guessing an API, prop or config option",
  lessons: "lessons_search: problems earlier runs hit, their root causes and the fixes that passed verify; search before debugging",
  spec: "spec_get / spec_trace: this run's spec items by id, and what they link to with task-board status",
};

/**
 * Every librarian call is one more model turn re-reading the whole context,
 * so the note steers agents to call it when it saves guessing, not by habit.
 */
function librarianNote(toolsets: LibrarianToolset[]): string {
  if (toolsets.length === 0) return "";
  return `- You have the factory librarian (mcp__${LIBRARIAN_SERVER}__* tools). Use it when you are unsure, not by routine: each call costs a turn. Ask several things in one turn when you can (parallel tool calls). It has a call limit per step.
${toolsets.map((set) => `  - ${LIBRARIAN_NOTES[set]}`).join("\n")}
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
