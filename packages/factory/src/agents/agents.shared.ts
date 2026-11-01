import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

import type { StageKey } from "../pipeline/pipeline.types";

export type StageContext = {
  allowanceUsd: number;
  appPort: number;
  appUrl: string;
  /** Latest successful handoff per stage. Never contains REPORT.md prose. */
  handoffs: Partial<Record<StageKey, unknown>>;
  /** Present when development is re-run to fix review/test findings. */
  fix: { attempt: number; review: unknown; testing: unknown } | null;
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
  role: string;
  schema: Schema;
};

export const CODE_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "TodoWrite"];
export const READ_TOOLS = ["Read", "Glob", "Grep"];

/** Shared rules every agent sees, appended to the Claude Code system prompt. */
export function systemPromptFor(role: string, ctx: Pick<StageContext, "allowanceUsd" | "appPort">): string {
  return `You are the ${role} agent in an automated software factory that turns a user's prompt into a deployed web application.

Operating rules:
- You run unattended. Never ask questions; make sensible assumptions and record them.
- You have a hard spend limit of about $${ctx.allowanceUsd.toFixed(2)} for this step. Work efficiently: avoid re-reading files you already know and avoid unnecessary exploration.
- Your final answer must be the structured output requested. Its "reportMarkdown" field is read by humans auditing the factory: explain decisions, trade-offs and anything incomplete, concisely.

Execution environment (where code is built and tested): Debian Linux container with Node.js 22 + npm, Bun, Python 3 + pip/venv, Go, git and curl. Internet is available for package installs. There is NO Docker daemon here; never run docker commands.

Application contract every generated app must satisfy:
- A Dockerfile at the workspace root that builds and runs the whole app as ONE container (no docker-compose, no external services, no API keys).
- The server listens on 0.0.0.0 and the port from the PORT environment variable (default ${ctx.appPort}).
- GET /health returns HTTP 200 once the app is ready.
- Persistent data uses SQLite or files under /data, or memory if persistence is unneeded.
- The UI is served by the same server at "/".`;
}

export function jsonBlock(title: string, value: unknown): string {
  return `## ${title}\n\n\`\`\`json\n${JSON.stringify(value ?? null, null, 2)}\n\`\`\``;
}
