import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RESULT_MAX_CHARS } from "./librarian.constants";
import { catalogItems, chunkMarkdown, indexLibrary } from "./librarian.ingest";
import { getCatalogItem, getDoc } from "./librarian.store";
import { searchCatalog, searchDocs } from "./librarian.service";
import { copyIntoWorkspace } from "./librarian.tools";

describe("chunkMarkdown", () => {
  test("splits by heading, keeps fenced headings and drops demo embeds", () => {
    const md = [
      "---",
      "category: Components",
      "---",
      "# Table",
      "A table displays rows of data.",
      "<code src=\"./demo/basic.tsx\">Basic</code>",
      "## Pagination",
      "Use `pagination` to control pages.",
      "```js",
      "# not a heading",
      "```",
      "## API",
      "x",
    ].join("\n");
    const chunks = chunkMarkdown("antd@6/table.md", md);
    expect(chunks.map((c) => c.id)).toEqual(["antd@6/table#table", "antd@6/table#pagination"]);
    expect(chunks[0]).toMatchObject({ library: "antd@6", title: "antd@6 › Table" });
    expect(chunks[0]!.body).not.toContain("demo");
    expect(chunks[1]!.body).toContain("# not a heading");
  });

  test("long sections become numbered parts that each fit a tool result", () => {
    const para = "word ".repeat(300).trim();
    const chunks = chunkMarkdown("vite@7/config.md", `# Config\n\n## Options\n\n${[para, para, para, para].join("\n\n")}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]!.id).toBe("vite@7/config#options-2");
    expect(chunks.every((c) => c.body.length <= RESULT_MAX_CHARS - 300)).toBe(true);
  });
});

describe("catalogItems", () => {
  test("reads README metadata and only the files folder", () => {
    const items = catalogItems([
      { content: "# ZT list page\n\nList template with filters.\n\nTags: antd, list", path: "zt-list-page/README.md" },
      { content: "export {}", path: "zt-list-page/files/ListPage.tsx" },
      { content: "notes", path: "zt-list-page/NOTES.md" },
      { content: "no readme", path: "broken/files/a.ts" },
      { content: "# Draft\n\nNot reviewed.\n\nStatus: draft", path: "draft-item/README.md" },
    ]);
    expect(items).toEqual([
      {
        files: [{ content: "export {}", path: "ListPage.tsx" }],
        name: "zt-list-page",
        readme: "# ZT list page\n\nList template with filters.\n\nTags: antd, list",
        summary: "List template with filters.",
        tags: ["antd", "list"],
      },
    ]);
  });
});

describe("indexLibrary", () => {
  test("indexes docs and catalog once, then skips unchanged content", async () => {
    const root = mkdtempSync(join(tmpdir(), "librarian-"));
    mkdirSync(join(root, "docs/antd@6"), { recursive: true });
    mkdirSync(join(root, "catalog/zt-shell/files"), { recursive: true });
    writeFileSync(join(root, "docs/antd@6/table.md"), "# Table\n\n## Pagination\n\nUse the pagination prop with current and pageSize.");
    writeFileSync(join(root, "catalog/zt-shell/README.md"), "# ZT shell\n\nApp shell with side menu.\n\nTags: antd, layout");
    writeFileSync(join(root, "catalog/zt-shell/files/Shell.tsx"), "export function Shell() {}");

    expect(await indexLibrary(root, [])).toEqual({ catalog: 1, docs: 1 });
    expect(await indexLibrary(root, [])).toEqual({ catalog: null, docs: null });

    expect(searchDocs("table pageSize", "antd")[0]?.id).toBe("antd@6/table#pagination");
    expect(searchDocs("table pageSize", "vite")).toEqual([]);
    expect(getDoc("antd@6/table#pagination")?.body).toContain("current and pageSize");
    expect(searchCatalog("side menu layout")[0]?.name).toBe("zt-shell");

    const workspace = mkdtempSync(join(tmpdir(), "workspace-"));
    const item = getCatalogItem("zt-shell")!;
    expect(await copyIntoWorkspace(workspace, "src/shell", item.files)).toEqual({ skipped: [], written: ["src/shell/Shell.tsx"] });
    expect(readFileSync(join(workspace, "src/shell/Shell.tsx"), "utf8")).toBe("export function Shell() {}");
    expect(await copyIntoWorkspace(workspace, "src/shell", item.files)).toEqual({ skipped: ["src/shell/Shell.tsx"], written: [] });
    await expect(copyIntoWorkspace(workspace, "../outside", item.files)).rejects.toThrow("inside the workspace");
  });
});

describe("ZT design system as docs", () => {
  test("is chunked by section under its own library", () => {
    const md = "---\nname: zt\n---\n\n## Factory overrides (read first)\n\nNo Figma here at all.\n\n# ZT Design System v2.0\n\nIntro text for the system.\n\n## 9. States and feedback\n\nEvery screen has loading, empty and error states.";
    const ids = chunkMarkdown("zt-design-system/skill.md", md).map((c) => c.id);
    expect(ids).toContain("zt-design-system/skill#9-states-and-feedback");
  });
});
