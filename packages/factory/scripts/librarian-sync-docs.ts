/**
 * Fetches the librarian's framework docs at pinned versions into
 * packages/factory/librarian/docs/<library>/. The files are committed, so
 * runs are reproducible and need no network for docs. Re-run after changing
 * a ref below; the factory re-indexes changed docs on its next start.
 *
 *   bun packages/factory/scripts/librarian-sync-docs.ts [library…]
 *
 * GitHub sources use one API call per library (60/hour unauthenticated;
 * set GITHUB_TOKEN for more) and raw.githubusercontent.com for the files.
 * Package sources read a published npm package through unpkg.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { LIBRARY_DIR } from "../src/librarian/librarian.constants";

type Source = {
  /** Folder name, `<name>@<major>`; agents filter docs_search by it. */
  library: string;
  license: string;
  /** Cleans a fetched file into plain Markdown; content is otherwise kept unchanged. */
  transform?: (text: string, path: string) => string;
} & (
  | {
      kind: "github";
      /** Maps a repo path to its file under the library folder, or null to skip it. */
      pick: (path: string) => string | null;
      ref: string;
      repo: string;
    }
  | {
      /** Files of a published npm package, `<name>@<exact version>`, mapped to local names. */
      files: Record<string, string>;
      kind: "package";
      package: string;
    }
);

// Pinned to the majors the architecture agent actually chooses (see recent
// runs' architecture handoffs), not to the newest releases.
const SOURCES: Source[] = [
  {
    kind: "github",
    library: "antd@6",
    license: "MIT",
    pick: (path) => path.match(/^components\/([\w-]+)\/index\.en-US\.md$/)?.[1]?.concat(".md") ?? null,
    ref: "6.6.8",
    repo: "ant-design/ant-design",
  },
  {
    kind: "github",
    library: "react-router@6",
    license: "MIT",
    pick: (path) => (/^docs\/.+\.md$/.test(path) && !/^docs\/(start\/tutorial|upgrading)/.test(path) ? path.slice("docs/".length) : null),
    ref: "react-router@6.30.6",
    repo: "remix-run/react-router",
  },
  {
    kind: "github",
    library: "vite@6",
    license: "MIT",
    pick: (path) => (/^docs\/(guide|config)\/[\w-]+\.md$/.test(path) ? path.slice("docs/".length) : null),
    ref: "v6.4.5",
    repo: "vitejs/vite",
  },
  {
    kind: "github",
    library: "vitest@3",
    license: "MIT",
    pick: (path) => (/^docs\/(api|config)\/[\w-]+\.md$/.test(path) || /^docs\/guide\/(mocking|cli|environment|filtering|lifecycle|test-context)\.md$/.test(path) ? path.slice("docs/".length) : null),
    ref: "v3.2.7",
    repo: "vitest-dev/vitest",
  },
  {
    kind: "github",
    library: "better-sqlite3@11",
    license: "MIT",
    pick: (path) => (path === "docs/api.md" ? "api.md" : null),
    ref: "v11.10.0",
    repo: "WiseLibs/better-sqlite3",
  },
  {
    kind: "github",
    library: "node-test@22",
    license: "MIT (Node.js docs)",
    pick: (path) => (path === "doc/api/test.md" ? "test.md" : null),
    ref: "v22.23.4",
    repo: "nodejs/node",
  },
  {
    kind: "github",
    library: "express@4",
    license: "CC BY 4.0 (Express docs)",
    // The API reference and the guides that matter for a JSON API; other languages and 5.x are skipped.
    pick: (path) =>
      path.match(/^src\/content\/api\/4x\/api\/(\w+)\/index\.mdx$/)?.[1]?.replace(/^/, "api/").concat(".md") ??
      path.match(/^src\/content\/docs\/en\/4x\/guide\/(routing|error-handling|using-middleware|writing-middleware|behind-proxies)\.mdx$/)?.[1]?.replace(/^/, "guide/").concat(".md") ??
      null,
    // The site has no release tags; this is the main branch commit the files were read from.
    ref: "4e285e21f3ecddafa215e2f802c8a0460e068d79",
    repo: "expressjs/expressjs.com",
    transform: titledMarkdown,
  },
  {
    kind: "github",
    library: "dayjs@1",
    license: "MIT",
    // The dayjs repo's docs folder only points to day.js.org; this is that site's source.
    pick: (path) => (/^docs\/(display|parse|manipulate|query|get-set|plugin|i18n|durations)\/[\w-]+\.md$/.test(path) ? path.slice("docs/".length) : null),
    ref: "b78126d6b06a46d59933004e25a69789168be328",
    repo: "dayjs/dayjs-website",
    transform: titledMarkdown,
  },
  {
    files: { "README.md": "supertest.md" },
    kind: "package",
    library: "supertest@7",
    license: "MIT",
    package: "supertest@7.3.1",
  },
  {
    // Agents guess icon names; a wrong one fails the build. The package's index lists every real one.
    files: { "lib/icons/index.d.ts": "icons.md" },
    kind: "package",
    library: "ant-design-icons@6",
    license: "MIT",
    package: "@ant-design/icons@6.3.4",
    transform: iconList,
  },
];

const DOCS_DIR = join(LIBRARY_DIR, "docs");

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const sources = only.size ? SOURCES.filter((s) => only.has(s.library) || only.has(s.library.split("@")[0]!)) : SOURCES;
  for (const source of sources) {
    const files =
      source.kind === "github"
        ? (await listFiles(source)).map(([repoPath, local]) => ({ local, path: repoPath, url: `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${repoPath}` }))
        : Object.entries(source.files).map(([path, local]) => ({ local, path, url: `https://unpkg.com/${source.package}/${path}` }));
    const target = join(DOCS_DIR, source.library);
    await rm(target, { force: true, recursive: true });
    for (const file of files) {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
      const text = await response.text();
      const out = join(target, file.local);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, source.transform ? source.transform(text, file.local) : text);
    }
    console.info("[librarian-sync] done", { files: files.length, library: source.library });
  }
  await writeFile(join(DOCS_DIR, "SOURCES.md"), renderSources());
}

async function listFiles(source: Extract<Source, { kind: "github" }>): Promise<[string, string][]> {
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
  const rows = SOURCES.map((s) =>
    s.kind === "github"
      ? `| ${s.library} | [${s.repo}](https://github.com/${s.repo}/tree/${encodeURIComponent(s.ref)}) | \`${s.ref}\` | ${s.license} |`
      : `| ${s.library} | [npm ${s.package}](https://www.npmjs.com/package/${s.package.replace(/@[^@]+$/, "")}) | \`${s.package}\` | ${s.license} |`,
  );
  return `# Librarian docs sources

Fetched by \`scripts/librarian-sync-docs.ts\`, unchanged except that Express's MDX is reduced to Markdown and the icon package's index is rendered as a name list. Each library's documentation stays under its own licence.

| Library | Source | Ref | Licence |
|---|---|---|---|
${rows.join("\n")}
`;
}

/**
 * Doc sites (Express's MDX, dayjs's Docusaurus) keep the page title in front
 * matter, and Express imports site components at the top. Keep the prose and
 * code and turn the title into a heading the indexer can use.
 */
function titledMarkdown(text: string): string {
  const title = text.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?\n---\n/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  // Only the leading block of component imports goes; imports inside code examples stay.
  const body = text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^(\s*import\s.+from\s+["'][^"']+["'];?\s*\n)+/, "")
    .replace(/<\/?(Alert|Signature|Param|PackageManagerCommand|Fragment)\b[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${title ? `# ${title}\n\n` : ""}${body}\n`;
}

function iconList(text: string): string {
  const names = [...text.matchAll(/as (\w+) \}/g)].map((m) => m[1]!);
  const theme = (suffix: string) => names.filter((n) => n.endsWith(suffix));
  // One paragraph per initial letter: the indexer splits long sections between paragraphs, never inside a name.
  const section = (heading: string, list: string[]) => {
    const byLetter = Map.groupBy(list, (name) => name[0]!);
    return `## ${heading}\n\n${[...byLetter.values()].map((group) => group.join(", ")).join("\n\n")}\n`;
  };
  return `# Ant Design icons

Import by exact name: \`import { SearchOutlined } from "@ant-design/icons";\`. Only these ${names.length} names exist; any other import fails the build.

${section("Outlined", theme("Outlined"))}
${section("Filled", theme("Filled"))}
${section("TwoTone", theme("TwoTone"))}`;
}

await main();
