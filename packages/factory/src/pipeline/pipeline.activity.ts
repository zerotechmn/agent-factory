import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { relative } from "node:path";

import { parseTestCounts, parseTestLog, toolResultText } from "../board/board.utils";

export type Activity = {
  at: string;
  /** action: one plain line per tool call. message: the agent's own words (Markdown) between calls. */
  kind: "action" | "message";
  /** Stage label, e.g. "Development", "Fix 1". */
  stage: string;
  text: string;
};

const KEEP_PER_RUN = 60;
/** The feed is polled every 2 s; a long closing summary is cut, the full text is in the transcript. */
const MESSAGE_MAX_CHARS = 1_500;

// In memory only: the feed is for people watching a run live. A restart
// fails in-flight runs anyway, and every action is in transcript.jsonl.
const feeds = new Map<string, Activity[]>();

export function recentActivity(runId: string): Activity[] {
  return [...(feeds.get(runId) ?? [])].reverse();
}

export function recordActivity(runId: string, stage: string, text: string, kind: Activity["kind"] = "action"): void {
  // Only a stage's latest message is shown, so older ones are dropped rather than polled.
  const feed = (feeds.get(runId) ?? []).filter((a) => kind === "action" || a.kind === "action" || a.stage !== stage);
  feed.push({ at: new Date().toISOString(), kind, stage, text });
  if (feed.length > KEEP_PER_RUN) feed.splice(0, feed.length - KEEP_PER_RUN);
  feeds.set(runId, feed);
}

export function clearActivity(runId: string): void {
  feeds.delete(runId);
}

/**
 * Turns an agent's tool calls into plain-language lines ("Writing
 * src/routes/bookings.ts", "Running the tests: 34 passing, 2 failing").
 * Reads the stream the factory already receives, so it costs no tokens.
 */
export function activityObserver({
  cwd,
  runId,
  stage,
}: {
  cwd: string;
  runId: string;
  stage: string;
}): (message: SDKMessage) => void {
  const bashCalls = new Set<string>();
  return (message) => {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) recordActivity(runId, stage, clip(block.text.trim()), "message");
        if (block.type !== "tool_use") continue;
        if (block.name === "Bash") bashCalls.add(block.id);
        const text = describeToolUse(block.name, block.input, cwd);
        if (text) recordActivity(runId, stage, text);
      }
      return;
    }
    if (message.type !== "user" || !Array.isArray(message.message.content)) return;
    for (const block of message.message.content) {
      if (block.type !== "tool_result" || !bashCalls.has(block.tool_use_id)) continue;
      const summary = summarizeTestRun(toolResultText(block.content));
      if (summary) recordActivity(runId, stage, summary);
    }
  };
}

export function describeToolUse(name: string, input: unknown, cwd: string): string | null {
  const i = (input ?? {}) as Record<string, unknown>;
  const file = typeof i.file_path === "string" ? shortPath(i.file_path, cwd) : "";
  switch (name) {
    case "Write":
      return `Writing ${file}`;
    case "Edit":
    case "MultiEdit":
      return `Editing ${file}`;
    case "Read":
      return `Reading ${file}`;
    case "Glob":
    case "Grep":
      return "Searching the code";
    case "Skill":
      return `Loading the ${String(i.skill ?? i.name ?? "").replace(/^factory:/, "")} skill`;
    case "WebSearch":
      return `Searching the web: ${String(i.query ?? "")}`;
    case "WebFetch":
      return `Reading ${hostOf(String(i.url ?? ""))}`;
    case "TodoWrite":
      return currentTodo(i.todos);
    case "StructuredOutput":
      return "Handing the result to the next agent";
    case "Bash":
      return describeCommand(String(i.command ?? ""), typeof i.description === "string" ? i.description : "");
    default:
      if (name.endsWith("browser_check")) return `Checking ${Array.isArray(i.paths) ? i.paths.length : ""} screens in a browser`.replace("  ", " ");
      if (name.startsWith("mcp__librarian__")) return describeLibrarian(name.slice("mcp__librarian__".length), i);
      if (name.startsWith("mcp__")) return `Using ${name.split("__").at(-1)?.replace(/_/g, " ")}`;
      return null;
  }
}

function describeLibrarian(tool: string, input: Record<string, unknown>): string {
  const text = (key: string) => String(input[key] ?? "");
  switch (tool) {
    case "spec_get":
      return `Looking up ${text("id")}`;
    case "spec_trace":
      return `Tracing what ${text("id")} links to`;
    case "lessons_search":
      return `Checking past lessons: ${text("query")}`;
    case "docs_search":
      return `Searching docs: ${input.library ? `${text("library")} ` : ""}${text("query")}`;
    case "docs_read":
      return `Reading docs: ${text("id")}`;
    case "catalog_search":
      return `Searching the code catalog: ${text("query")}`;
    case "catalog_get":
      return `Copying ${text("name")} from the catalog`;
    default:
      return `Asking the librarian (${tool.replace(/_/g, " ")})`;
  }
}

/** "34 passing, 2 failing" when a command's output is a test run with named cases. */
export function summarizeTestRun(output: string): string | null {
  const results = [...parseTestLog(output).values()];
  const counts =
    parseTestCounts(output) ??
    (results.length ? { failed: results.filter((r) => r === "failed").length, passed: results.filter((r) => r === "passed").length } : null);
  if (!counts) return null;
  return `Test run: ${counts.passed} passing${counts.failed ? `, ${counts.failed} failing` : ""}`;
}

export function describeCommand(command: string, description: string): string {
  // Claude Code's Bash tool may carry the model's own one-line description; it reads better than the raw command.
  if (description) return description.replace(/^./, (c) => c.toUpperCase());
  const parts: string[] = [];
  // Heredoc writes: the developer often creates files this way instead of with the Write tool.
  const written = [...command.matchAll(/\bcat\s+>{1,2}\s*([^\s<;&|]+)\s*<</g)].map((m) => m[1]!);
  if (written.length) parts.push(`Writing ${written.slice(0, 2).join(", ")}${written.length > 2 ? ` and ${written.length - 2} more` : ""}`);
  else if (/\bsed -i\b|\bpython3? -\s*<</.test(command)) parts.push("Editing files");
  if (/\b(npm (ci|i|install)|bun install|pip install|yarn install|pnpm (i|install))\b/.test(command)) parts.push("installing dependencies");
  if (/\b(npm (run )?test|node --test|bun test|pytest|vitest|jest|go test)\b/.test(command)) parts.push("running the tests");
  if (/\bcurl\b/.test(command)) parts.push("checking the running app");
  if (!parts.length) {
    if (/^\s*(ls|cat|head|tail|find|tree|wc)\b/.test(command)) return "Looking through the workspace";
    if (/\b(node|bun|python3?)\s+\S+\.(js|ts|py)\b/.test(command) && /&\s*$|nohup|\bsleep\b/.test(command)) return "Starting the app";
    return "Running a command";
  }
  const text = parts.join(", then ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clip(text: string): string {
  return text.length > MESSAGE_MAX_CHARS ? `${text.slice(0, MESSAGE_MAX_CHARS).trimEnd()}…` : text;
}

function currentTodo(todos: unknown): string | null {
  if (!Array.isArray(todos)) return null;
  const active = todos.find((t) => (t as { status?: string }).status === "in_progress") as { activeForm?: string; content?: string } | undefined;
  return active ? (active.activeForm ?? active.content ?? null) : null;
}

function shortPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") ? rel : path.split("/").slice(-2).join("/");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "a web page";
  }
}
