/**
 * Fetches the librarian's framework docs at pinned versions into
 * packages/factory/librarian/docs/<library>/. The files are committed, so
 * runs are reproducible and need no network for docs. Re-run after changing
 * a ref below; the factory re-indexes changed docs on its next start.
 *
 *   bun packages/factory/scripts/librarian-sync-docs.ts [library…]
 *
 * Uses one GitHub API call per library (60/hour unauthenticated; set
 * GITHUB_TOKEN for more) and raw.githubusercontent.com for the files.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { LIBRARY_DIR } from "../src/librarian/librarian.constants";

type Source = {
  /** Folder name, `<name>@<major>`; agents filter docs_search by it. */
  library: string;
  license: string;
  /** Maps a repo path to its file under the library folder, or null to skip it. */
  pick: (path: string) => string | null;
  ref: string;
  repo: string;
};

// Pinned to the majors the architecture agent actually chooses (see recent
// runs' architecture handoffs), not to the newest releases.
const SOURCES: Source[] = [
  {
    library: "antd@6",
    license: "MIT",
    pick: (path) => path.match(/^components\/([\w-]+)\/index\.en-US\.md$/)?.[1]?.concat(".md") ?? null,
    ref: "6.6.8",
    repo: "ant-design/ant-design",
  },
  {
    library: "react-router@6",
    license: "MIT",
    pick: (path) => (/^docs\/.+\.md$/.test(path) && !/^docs\/(start\/tutorial|upgrading)/.test(path) ? path.slice("docs/".length) : null),
    ref: "react-router@6.30.6",
    repo: "remix-run/react-router",
  },
  {
    library: "vite@6",
    license: "MIT",
    pick: (path) => (/^docs\/(guide|config)\/[\w-]+\.md$/.test(path) ? path.slice("docs/".length) : null),
    ref: "v6.4.5",
    repo: "vitejs/vite",
  },
  {
    library: "vitest@3",
    license: "MIT",
    pick: (path) => (/^docs\/(api|config)\/[\w-]+\.md$/.test(path) || /^docs\/guide\/(mocking|cli|environment|filtering|lifecycle|test-context)\.md$/.test(path) ? path.slice("docs/".length) : null),
    ref: "v3.2.7",
    repo: "vitest-dev/vitest",
  },
  {
    library: "better-sqlite3@11",
    license: "MIT",
    pick: (path) => (path === "docs/api.md" ? "api.md" : null),
    ref: "v11.10.0",
    repo: "WiseLibs/better-sqlite3",
  },
  {
    library: "node-test@22",
    license: "MIT (Node.js docs)",
    pick: (path) => (path === "doc/api/test.md" ? "test.md" : null),
    ref: "v22.23.4",
    repo: "nodejs/node",
  },
];

const DOCS_DIR = join(LIBRARY_DIR, "docs");

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const sources = only.size ? SOURCES.filter((s) => only.has(s.library) || only.has(s.library.split("@")[0]!)) : SOURCES;
  for (const source of sources) {
    const files = await listFiles(source);
    const target = join(DOCS_DIR, source.library);
    await rm(target, { force: true, recursive: true });
    for (const [repoPath, localPath] of files) {
      const response = await fetch(`https://raw.githubusercontent.com/${source.repo}/${source.ref}/${repoPath}`);
      if (!response.ok) throw new Error(`${source.repo}@${source.ref}/${repoPath}: HTTP ${response.status}`);
      const out = join(target, localPath);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, await response.text());
    }
    console.info("[librarian-sync] done", { files: files.length, library: source.library, ref: source.ref });
  }
  await writeFile(join(DOCS_DIR, "SOURCES.md"), renderSources());
}

async function listFiles(source: Source): Promise<[string, string][]> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`${source.repo}@${source.ref}: GitHub API ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { tree: { path: string; type: string }[]; truncated: boolean };
  // A truncated tree would silently drop pages; better to fail and pin a narrower source.
  if (body.truncated) throw new Error(`${source.repo}@${source.ref}: tree listing truncated`);
  return body.tree.flatMap((entry) => {
    const local = entry.type === "blob" ? source.pick(entry.path) : null;
    return local ? [[entry.path, local] as [string, string]] : [];
  });
}

function renderSources(): string {
  const rows = SOURCES.map((s) => `| ${s.library} | [${s.repo}](https://github.com/${s.repo}/tree/${encodeURIComponent(s.ref)}) | \`${s.ref}\` | ${s.license} |`);
  return `# Librarian docs sources

Fetched unchanged by \`scripts/librarian-sync-docs.ts\`. Each library's documentation stays under its own licence.

| Library | Source | Ref | Licence |
|---|---|---|---|
${rows.join("\n")}
`;
}

await main();
