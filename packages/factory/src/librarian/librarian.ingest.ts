import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { LIBRARY_DIR, RESULT_MAX_CHARS } from "./librarian.constants";
import * as LibrarianStore from "./librarian.store";
import type { CatalogItem, DocChunk } from "./librarian.types";

/** Leaves room for the title and id lines inside one tool result. */
const CHUNK_MAX_CHARS = RESULT_MAX_CHARS - 300;

const CATALOG_FILE_MAX_BYTES = 50_000;

/**
 * Rebuilds the docs and catalog indexes from librarian/ when their content
 * changed since the last start. Hashing the files is cheap; re-chunking a few
 * MB of docs on every boot is not worth it.
 */
export async function indexLibrary(root = LIBRARY_DIR): Promise<{ catalog: number | null; docs: number | null }> {
  const at = new Date().toISOString();
  const result: { catalog: number | null; docs: number | null } = { catalog: null, docs: null };

  const docFiles = await readTree(join(root, "docs"), (path) => path.endsWith(".md"));
  const docsHash = hashFiles(docFiles);
  if (LibrarianStore.indexedHash("docs") !== docsHash) {
    const chunks = docFiles.flatMap((file) => chunkMarkdown(file.path, file.content));
    LibrarianStore.replaceDocs(chunks, docsHash, at);
    result.docs = chunks.length;
  }

  const catalogFiles = await readTree(join(root, "catalog"), () => true);
  const catalogHash = hashFiles(catalogFiles);
  if (LibrarianStore.indexedHash("catalog") !== catalogHash) {
    const items = catalogItems(catalogFiles);
    LibrarianStore.replaceCatalog(items, catalogHash, at);
    result.catalog = items.length;
  }
  return result;
}

/**
 * Splits a doc page into sections by heading, each small enough to return
 * whole from docs_read. `path` is relative to docs/, and its first folder is
 * the library (e.g. "antd@6/table.md").
 */
export function chunkMarkdown(path: string, markdown: string): DocChunk[] {
  const library = path.split("/")[0] ?? path;
  const page = path.replace(/\.md$/, "");
  const lines = stripNoise(markdown).split("\n");
  const pageTitle = lines.find((l) => /^#\s/.test(l))?.replace(/^#\s+/, "").trim() || page.split("/").at(-1) || page;

  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: pageTitle, lines: [] as string[] };
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence ? line.match(/^#{1,3}\s+(.+)/) : null;
    if (heading) {
      sections.push(current);
      current = { heading: heading[1]!.trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);

  const chunks: DocChunk[] = [];
  const usedIds = new Set<string>();
  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    if (body.length < 20) continue;
    const title = section.heading === pageTitle ? `${library} › ${pageTitle}` : `${library} › ${pageTitle} › ${section.heading}`;
    const parts = splitBody(body, CHUNK_MAX_CHARS);
    parts.forEach((part, i) => {
      let id = `${page}#${slug(section.heading)}${i ? `-${i + 1}` : ""}`;
      for (let n = 2; usedIds.has(id); n++) id = `${page}#${slug(section.heading)}-${n}`;
      usedIds.add(id);
      chunks.push({ body: part, id, library, title: parts.length > 1 ? `${title} (${i + 1}/${parts.length})` : title });
    });
  }
  return chunks;
}

/**
 * catalog/<name>/README.md describes the item: "# Title", a summary
 * paragraph and a "Tags: a, b" line. Everything under catalog/<name>/files/
 * is what catalog_get copies into the workspace. A "Status: draft" line keeps
 * an item out of the index.
 */
export function catalogItems(files: { content: string; path: string }[]): CatalogItem[] {
  const byItem = new Map<string, { content: string; path: string }[]>();
  for (const file of files) {
    const [name, ...rest] = file.path.split("/");
    if (!name || rest.length === 0) continue;
    byItem.set(name, [...(byItem.get(name) ?? []), { content: file.content, path: rest.join("/") }]);
  }

  const items: CatalogItem[] = [];
  for (const [name, itemFiles] of byItem) {
    const readme = itemFiles.find((f) => f.path === "README.md")?.content;
    // Promoted code stays out of search until a person has made it generic and reviewed it.
    if (!readme || /^status:\s*draft\b/im.test(readme)) continue;
    const paragraphs = readme.split(/\n\s*\n/).map((p) => p.trim());
    const summary = paragraphs.find((p) => p && !p.startsWith("#") && !/^tags:/i.test(p)) ?? "";
    const tags = (readme.match(/^tags:\s*(.+)$/im)?.[1] ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const payload = itemFiles
      .filter((f) => f.path.startsWith("files/") && f.content.length <= CATALOG_FILE_MAX_BYTES)
      .map((f) => ({ content: f.content, path: f.path.slice("files/".length) }));
    items.push({ files: payload, name, readme, summary, tags });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/** Front matter, demo embeds and HTML comments are noise in search results and cost tokens. */
function stripNoise(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*<code src=.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function splitBody(body: string, max: number): string[] {
  if (body.length <= max) return [body];
  const parts: string[] = [];
  let current = "";
  for (const paragraph of body.split(/\n\s*\n/)) {
    // A single paragraph longer than a chunk (a big table or code block) is cut hard.
    const pieces = paragraph.length > max ? (paragraph.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? []) : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > max) {
        parts.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

async function readTree(dir: string, include: (path: string) => boolean): Promise<{ content: string; path: string }[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: { content: string; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const path = relative(dir, full).split(sep).join("/");
    if (!include(path)) continue;
    files.push({ content: await readFile(full, "utf8"), path });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function hashFiles(files: { content: string; path: string }[]): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of files) hasher.update(`${file.path}\0${file.content}\0`);
  return hasher.digest("hex");
}
