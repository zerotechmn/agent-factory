import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { z } from "zod";

import * as BoardStore from "../board/board.store";
import { config } from "../lib/config";
import type { AgentStageKey } from "../pipeline/pipeline.types";
import { LIBRARIAN_SERVER, STAGE_CALL_LIMITS, STAGE_TOOLSETS, TOOLSET_TOOLS, type LibrarianToolset } from "./librarian.constants";
import * as LibrarianService from "./librarian.service";
import { lookupSpec, traceSpec } from "./librarian.spec";
import * as LibrarianStore from "./librarian.store";

type ToolResult = { content: { text: string; type: "text" }[]; isError: boolean };

/** The toolsets a stage gets, or none when the librarian is switched off. */
export function librarianToolsets(stageKey: AgentStageKey): LibrarianToolset[] {
  return config.LIBRARIAN === "off" ? [] : STAGE_TOOLSETS[stageKey];
}

export function librarianToolNames(stageKey: AgentStageKey): string[] {
  return librarianToolsets(stageKey).flatMap((set) => TOOLSET_TOOLS[set].map((name) => `mcp__${LIBRARIAN_SERVER}__${name}`));
}

/**
 * One server per stage invocation, so the call limit counts per session.
 * `handoffs` is the pipeline's live object: a spec lookup always sees the
 * latest PRD and test plan, including a repaired one.
 */
export function librarianMcpServer({
  handoffs,
  runId,
  stage,
  stageKey,
  workspaceDir,
}: {
  handoffs: Partial<Record<AgentStageKey, unknown>>;
  runId: string;
  /** Stage label for the usage log, e.g. "Fix 1". */
  stage: string;
  stageKey: AgentStageKey;
  workspaceDir: string;
}): McpSdkServerConfigWithInstance | null {
  const toolsets = librarianToolsets(stageKey);
  if (toolsets.length === 0) return null;
  const limit = STAGE_CALL_LIMITS[stageKey];
  let calls = 0;

  type Answer = { hits: number; results?: string[]; text: string };
  const run = async (name: string, query: string, body: () => Promise<Answer> | Answer) => {
    calls += 1;
    if (calls > limit) {
      LibrarianStore.logQuery({ at: new Date().toISOString(), hits: 0, query, runId, stage, tool: "limit" });
      return reply(`Librarian limit reached (${limit} calls for this step). Continue with what you already have.`, false);
    }
    try {
      const { hits, results, text } = await body();
      LibrarianStore.logQuery({ at: new Date().toISOString(), hits, query, results, runId, stage, tool: name });
      return reply(LibrarianService.clip(text), false);
    } catch (error) {
      console.error("[librarian] tool failed", { message: error instanceof Error ? error.message : String(error), name, runId });
      return reply(`The librarian could not answer: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };

  const tools = [
    // catalog
    tool(
      "catalog_search",
      "Search the factory's catalog of proven modules taken from earlier apps that passed verify (e.g. app shell with menu, list page with filters and pagination, approval flow). Returns names and summaries. Check it before writing a common module from scratch.",
      { query: z.string().min(2).describe("What you need, e.g. \"antd list page filters pagination\"") },
      ({ query }) =>
        run("catalog_search", query, () => {
          const items = LibrarianService.searchCatalog(query);
          if (!items.length) return { hits: 0, text: "No catalog items match." };
          return {
            hits: items.length,
            results: items.map((i) => `catalog:${i.name}`),
            text: items
              .map((i) => `- ${i.name}: ${i.summary}${i.tags.length ? ` [${i.tags.join(", ")}]` : ""} (${i.files.length} files)`)
              .join("\n")
              .concat("\n\nCopy one into the workspace with catalog_get."),
          };
        }),
    ),
    tool(
      "catalog_get",
      "Copy a catalog item's files into your workspace under targetDir, then adapt them. Existing files are never overwritten. Returns the item's README (usage and contract) and the files written.",
      {
        name: z.string().describe("Item name from catalog_search"),
        targetDir: z.string().describe("Workspace-relative folder to copy into, e.g. \"src/web/shell\""),
      },
      ({ name, targetDir }) =>
        run("catalog_get", name, async () => {
          const item = LibrarianStore.getCatalogItem(name);
          if (!item) return { hits: 0, text: `No catalog item named "${name}". Use catalog_search.` };
          const { skipped, written } = await copyIntoWorkspace(workspaceDir, targetDir, item.files);
          return {
            hits: 1,
            results: [`catalog:${item.name}`],
            text: `${item.readme}\n\n## Copied\n${written.map((p) => `- ${p}`).join("\n") || "(nothing)"}${
              skipped.length ? `\n\n## Skipped (already exist)\n${skipped.map((p) => `- ${p}`).join("\n")}` : ""
            }`,
          };
        }),
    ),
    // docs
    tool(
      "docs_search",
      "Search curated, version-pinned framework docs (for example antd@6, react-router@6, vite, express@4, better-sqlite3, node:test). Use it instead of guessing an API, prop or config option. Returns the start of each matching section with its id.",
      {
        library: z.string().optional().describe("Limit to one library, e.g. \"antd\" or \"antd@6\""),
        query: z.string().min(2).describe("e.g. \"Table pagination onChange\""),
      },
      ({ library, query }) =>
        run("docs_search", `${library ? `${library}: ` : ""}${query}`, () => {
          const chunks = LibrarianService.searchDocs(query, library ?? null);
          if (chunks.length) {
            return { hits: chunks.length, results: chunks.map((c) => `doc:${c.id}`), text: `${LibrarianService.formatDocHits(chunks)}\n\nOpen a whole section with docs_read <id>.` };
          }
          const libraries = LibrarianStore.listLibraries();
          return { hits: 0, text: `No matching docs.${libraries.length ? ` Libraries available: ${libraries.join(", ")}.` : " No docs are installed."}` };
        }),
    ),
    tool(
      "docs_read",
      "Read one whole docs section by the id docs_search returned.",
      { id: z.string().describe("Section id, e.g. \"antd@6/table#pagination\"") },
      ({ id }) =>
        run("docs_read", id, () => {
          const chunk = LibrarianStore.getDoc(id);
          return chunk ? { hits: 1, results: [`doc:${chunk.id}`], text: `# ${chunk.title}\n\n${chunk.body}` } : { hits: 0, text: `No docs section "${id}". Use docs_search.` };
        }),
    ),
    // lessons
    tool(
      "lessons_search",
      "Search lessons from earlier factory runs: problems that failed verify or review, their root causes and the fixes that made them pass. Search before debugging a failure or when unsure about a known trap (layout, Docker, test runner, ports).",
      { query: z.string().min(2).describe("The symptom or error, e.g. \"words split across lines overflow-wrap\"") },
      ({ query }) =>
        run("lessons_search", query, () => {
          const lessons = LibrarianService.searchLessons(query);
          return lessons.length
            ? { hits: lessons.length, results: lessons.map((l) => `lesson:${l.id}`), text: LibrarianService.formatLessons(lessons) }
            : { hits: 0, text: "No lessons match." };
        }),
    ),
    // spec
    tool(
      "spec_get",
      "Get one item of this run's spec by id: feature (F-03), acceptance criterion (AC-F03-02), screen (S-02), business rule (BRL-01), entity (ENT-01), NFR, test case (TC-7), smoke check (SMOKE-1), a role by name, or an endpoint by operationId.",
      { id: z.string().min(1) },
      ({ id }) =>
        run("spec_get", id, () => {
          const hit = lookupSpec(handoffs, id);
          return hit
            ? { hits: 1, results: [`spec:${hit.id}`], text: `${hit.kind} ${hit.id}\n${JSON.stringify(hit.item)}\n\nspec_trace ${hit.id} shows what it links to.` }
            : { hits: 0, text: `Nothing with id "${id}" in this run's spec.` };
        }),
    ),
    tool(
      "spec_trace",
      "Show what a spec item is linked to, with task-board status: a feature's criteria, screens, rules and tests; a criterion's tests; a test's criteria; a screen's features, rules and endpoints. Use it to see what a change affects or what still lacks a passing test.",
      { id: z.string().min(1) },
      ({ id }) =>
        run("spec_trace", id, () => {
          const columns = new Map(BoardStore.listCards(runId).map((card) => [card.id, card.column]));
          const trace = traceSpec(handoffs, columns, id);
          if (!trace) return { hits: 0, text: `Nothing with id "${id}" in this run's spec.` };
          const tag = (linked: string) => (trace.columns[linked] ? `${linked} [${trace.columns[linked]}]` : linked);
          const lines = Object.entries(trace.links).map(([kind, ids]) => `${kind}: ${ids.length ? ids.map(tag).join(", ") : "none"}`);
          return { hits: 1, results: [`spec:${trace.id}`], text: [`${trace.kind} ${tag(trace.id)}`, ...lines].join("\n") };
        }),
    ),
  ];

  const enabled = new Set(toolsets.flatMap((set) => TOOLSET_TOOLS[set]));
  return createSdkMcpServer({ name: LIBRARIAN_SERVER, tools: tools.filter((t) => enabled.has(t.name)) });
}

/** Writes inside the workspace only; a targetDir like "../../" is refused. */
export async function copyIntoWorkspace(
  workspaceDir: string,
  targetDir: string,
  files: { content: string; path: string }[],
): Promise<{ skipped: string[]; written: string[] }> {
  const root = resolve(workspaceDir);
  const base = resolve(root, targetDir);
  if (base !== root && !base.startsWith(root + sep)) throw new Error("targetDir must be inside the workspace");
  const skipped: string[] = [];
  const written: string[] = [];
  for (const file of files) {
    const target = resolve(base, file.path);
    const rel = target.slice(root.length + 1);
    if (!target.startsWith(root + sep)) continue;
    if (existsSync(target)) {
      skipped.push(rel);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
    written.push(rel);
  }
  return { skipped, written };
}

function reply(text: string, isError: boolean): ToolResult {
  return { content: [{ text, type: "text" }], isError };
}
