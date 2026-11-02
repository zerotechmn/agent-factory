import { db } from "../lib/db";
import type { DesignSystem } from "../pipeline/pipeline.types";
import type { LessonStep } from "./librarian.constants";
import type { CatalogItem, DocChunk, Lesson, LessonInput, LibraryOverview, QueryEvent, QueryStat } from "./librarian.types";

// FTS5 tables are standalone and share their rowid with the base table, so
// one transaction keeps both in step without triggers.
db.exec(`
  CREATE TABLE IF NOT EXISTS library_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL UNIQUE,
    design_system TEXT NOT NULL,
    step TEXT NOT NULL,
    problem TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    fix TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    seen INTEGER NOT NULL DEFAULT 1,
    first_run_id TEXT NOT NULL,
    last_run_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS library_lessons_fts USING fts5(problem, root_cause, fix, tags);

  CREATE TABLE IF NOT EXISTS library_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id TEXT NOT NULL UNIQUE,
    library TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS library_docs_fts USING fts5(title, body);

  CREATE TABLE IF NOT EXISTS library_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    readme TEXT NOT NULL,
    files TEXT NOT NULL DEFAULT '[]'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS library_catalog_fts USING fts5(name, summary, tags, readme);

  CREATE TABLE IF NOT EXISTS library_index_meta (
    source TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS library_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    tool TEXT NOT NULL,
    query TEXT NOT NULL,
    hits INTEGER NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS library_queries_run ON library_queries (run_id, id);
`);

// Added after the first release: refs to what each lookup returned (lesson:12, doc:<id>, catalog:<name>, spec:<id>),
// so a run's page can show what was handed over, not just how many items.
const queryColumns = db.query<{ name: string }, []>("PRAGMA table_info(library_queries)").all();
if (!queryColumns.some((c) => c.name === "results")) {
  db.exec("ALTER TABLE library_queries ADD COLUMN results TEXT NOT NULL DEFAULT '[]'");
}

type RawLesson = {
  design_system: DesignSystem;
  fix: string;
  id: number;
  problem: string;
  root_cause: string;
  seen: number;
  step: LessonStep;
  tags: string;
};

type RawCatalog = { files: string; name: string; readme: string; summary: string; tags: string };

// ---- lessons ----

/** A lesson already seen in another run only counts up; its text stays the first, proven wording. */
export function upsertLesson(
  lesson: LessonInput & { designSystem: DesignSystem; runId: string; signature: string },
  at: string,
): void {
  db.transaction(() => {
    const existing = db.query<{ id: number }, [string]>("SELECT id FROM library_lessons WHERE signature = ?").get(lesson.signature);
    if (existing) {
      db.query("UPDATE library_lessons SET seen = seen + 1, last_run_id = ?, updated_at = ? WHERE id = ? AND last_run_id <> ?").run(
        lesson.runId,
        at,
        existing.id,
        lesson.runId,
      );
      return;
    }
    const tags = JSON.stringify(lesson.tags);
    const { lastInsertRowid } = db
      .query(
        `INSERT INTO library_lessons (signature, design_system, step, problem, root_cause, fix, tags, first_run_id, last_run_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(lesson.signature, lesson.designSystem, lesson.step, lesson.problem, lesson.rootCause, lesson.fix, tags, lesson.runId, lesson.runId, at, at);
    db.query("INSERT INTO library_lessons_fts (rowid, problem, root_cause, fix, tags) VALUES (?, ?, ?, ?, ?)").run(
      lastInsertRowid,
      lesson.problem,
      lesson.rootCause,
      lesson.fix,
      lesson.tags.join(" "),
    );
  })();
}

export function searchLessons(match: string, limit: number): Lesson[] {
  return db
    .query<RawLesson, [string, number]>(
      `SELECT l.* FROM library_lessons_fts f JOIN library_lessons l ON l.id = f.rowid
       WHERE library_lessons_fts MATCH ? ORDER BY bm25(library_lessons_fts), l.seen DESC LIMIT ?`,
    )
    .all(match, limit)
    .map(toLesson);
}

export function topLessons(designSystem: DesignSystem, limit: number): Lesson[] {
  return db
    .query<RawLesson, [DesignSystem, number]>("SELECT * FROM library_lessons WHERE design_system = ? ORDER BY seen DESC, id DESC LIMIT ?")
    .all(designSystem, limit)
    .map(toLesson);
}

// ---- docs and catalog (rebuilt from librarian/ whenever its content changes) ----

export function indexedHash(source: string): string | null {
  return db.query<{ hash: string }, [string]>("SELECT hash FROM library_index_meta WHERE source = ?").get(source)?.hash ?? null;
}

export function replaceDocs(chunks: DocChunk[], hash: string, at: string): void {
  db.transaction(() => {
    db.exec("DELETE FROM library_docs; DELETE FROM library_docs_fts;");
    const insert = db.query("INSERT INTO library_docs (chunk_id, library, title, body) VALUES (?, ?, ?, ?)");
    const insertFts = db.query("INSERT INTO library_docs_fts (rowid, title, body) VALUES (?, ?, ?)");
    for (const chunk of chunks) {
      const { lastInsertRowid } = insert.run(chunk.id, chunk.library, chunk.title, chunk.body);
      insertFts.run(lastInsertRowid, chunk.title, chunk.body);
    }
    setIndexedHash("docs", hash, at);
  })();
}

export function searchDocs(match: string, library: string | null, limit: number): DocChunk[] {
  return db
    .query<{ body: string; chunk_id: string; library: string; title: string }, [string, string | null, string | null, number]>(
      `SELECT d.chunk_id, d.library, d.title, d.body FROM library_docs_fts f JOIN library_docs d ON d.id = f.rowid
       WHERE library_docs_fts MATCH ? AND (? IS NULL OR d.library LIKE ? || '%')
       ORDER BY bm25(library_docs_fts, 5.0, 1.0) LIMIT ?`,
    )
    .all(match, library, library, limit)
    .map((row) => ({ body: row.body, id: row.chunk_id, library: row.library, title: row.title }));
}

export function getDoc(chunkId: string): DocChunk | null {
  const row = db
    .query<{ body: string; chunk_id: string; library: string; title: string }, [string]>(
      "SELECT chunk_id, library, title, body FROM library_docs WHERE chunk_id = ?",
    )
    .get(chunkId);
  return row ? { body: row.body, id: row.chunk_id, library: row.library, title: row.title } : null;
}

/**
 * Sections of one doc page (e.g. antd's date-picker page, react-router's
 * use-navigate page), its API section first: what someone who just imported
 * that component or hook most likely needs.
 */
export function pageSections(library: string, page: string, limit: number): DocChunk[] {
  return db
    .query<{ body: string; chunk_id: string; library: string; title: string }, [string, string, number]>(
      `SELECT chunk_id, library, title, body FROM library_docs
       WHERE library LIKE ? || '%' AND chunk_id LIKE '%/' || ? || '#%'
       ORDER BY (chunk_id LIKE '%#api') DESC, id LIMIT ?`,
    )
    .all(library, page, limit)
    .map((row) => ({ body: row.body, id: row.chunk_id, library: row.library, title: row.title }));
}

export function listLibraries(): string[] {
  return db.query<{ library: string }, []>("SELECT DISTINCT library FROM library_docs ORDER BY library").all().map((r) => r.library);
}

export function replaceCatalog(items: CatalogItem[], hash: string, at: string): void {
  db.transaction(() => {
    db.exec("DELETE FROM library_catalog; DELETE FROM library_catalog_fts;");
    const insert = db.query("INSERT INTO library_catalog (name, summary, tags, readme, files) VALUES (?, ?, ?, ?, ?)");
    const insertFts = db.query("INSERT INTO library_catalog_fts (rowid, name, summary, tags, readme) VALUES (?, ?, ?, ?, ?)");
    for (const item of items) {
      const { lastInsertRowid } = insert.run(item.name, item.summary, JSON.stringify(item.tags), item.readme, JSON.stringify(item.files));
      insertFts.run(lastInsertRowid, item.name, item.summary, item.tags.join(" "), item.readme);
    }
    setIndexedHash("catalog", hash, at);
  })();
}

export function searchCatalog(match: string, limit: number): CatalogItem[] {
  return db
    .query<RawCatalog, [string, number]>(
      `SELECT c.* FROM library_catalog_fts f JOIN library_catalog c ON c.id = f.rowid
       WHERE library_catalog_fts MATCH ? ORDER BY bm25(library_catalog_fts, 5.0, 3.0, 3.0, 1.0) LIMIT ?`,
    )
    .all(match, limit)
    .map(toCatalogItem);
}

/** Names and summaries only: small enough to list in a prompt. */
export function listCatalog(limit: number): Pick<CatalogItem, "name" | "summary">[] {
  return db.query<{ name: string; summary: string }, [number]>("SELECT name, summary FROM library_catalog ORDER BY name LIMIT ?").all(limit);
}

export function getCatalogItem(name: string): CatalogItem | null {
  const row = db.query<RawCatalog, [string]>("SELECT * FROM library_catalog WHERE name = ?").get(name);
  return row ? toCatalogItem(row) : null;
}

// ---- usage log ----

export function logQuery(entry: { at: string; hits: number; query: string; results?: string[]; runId: string; stage: string; tool: string }): void {
  db.query("INSERT INTO library_queries (run_id, stage, tool, query, hits, results, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    entry.runId,
    entry.stage,
    entry.tool,
    entry.query,
    entry.hits,
    JSON.stringify(entry.results ?? []),
    entry.at,
  );
}

/** One run's lookups and hand-overs in order, for that run's own page. */
export function runActivity(runId: string): QueryEvent[] {
  return db
    .query<{ at: string; hits: number; id: number; query: string; results: string; stage: string; tool: string }, [string]>(
      "SELECT id, at, stage, tool, query, hits, results FROM library_queries WHERE run_id = ? ORDER BY id",
    )
    .all(runId)
    .map((row) => ({ ...row, results: parseStrings(row.results) }));
}

/** Lessons this run added, or proved again. */
export function lessonsFromRun(runId: string): Lesson[] {
  return db
    .query<RawLesson, [string, string]>("SELECT * FROM library_lessons WHERE first_run_id = ? OR last_run_id = ? ORDER BY id")
    .all(runId, runId)
    .map(toLesson);
}

export function lessonTitles(ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const rows = db
    .query<{ id: number; problem: string }, number[]>(`SELECT id, problem FROM library_lessons WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);
  return new Map(rows.map((r) => [r.id, r.problem]));
}

export function docTitles(chunkIds: string[]): Map<string, string> {
  if (chunkIds.length === 0) return new Map();
  const rows = db
    .query<{ chunk_id: string; title: string }, string[]>(`SELECT chunk_id, title FROM library_docs WHERE chunk_id IN (${chunkIds.map(() => "?").join(",")})`)
    .all(...chunkIds);
  return new Map(rows.map((r) => [r.chunk_id, r.title]));
}

/**
 * The shared library and usage counts across all runs. Only knowledge meant
 * for every run (docs, catalog, lessons) and totals: never another run's
 * queries or ids, since the portal has no login.
 */
export function overview(lessonLimit: number): LibraryOverview {
  const docs = db
    .query<{ library: string; sections: number }, []>("SELECT library, count(*) AS sections FROM library_docs GROUP BY library ORDER BY library")
    .all();
  const catalog = db
    .query<RawCatalog, []>("SELECT * FROM library_catalog ORDER BY name")
    .all()
    .map(toCatalogItem)
    .map((item) => ({ files: item.files.length, name: item.name, summary: item.summary, tags: item.tags }));
  const lessons = db
    .query<RawLesson & { updated_at: string }, [number]>("SELECT * FROM library_lessons ORDER BY seen DESC, id DESC LIMIT ?")
    .all(lessonLimit)
    .map((row) => ({ ...toLesson(row), updatedAt: row.updated_at }));
  const usage = db
    .query<{ lookups: number; pushes: number; runs: number; with_hits: number }, []>(
      `SELECT count(DISTINCT run_id) AS runs,
              count(*) FILTER (WHERE tool NOT LIKE 'auto:%' AND tool <> 'limit') AS lookups,
              count(*) FILTER (WHERE tool NOT LIKE 'auto:%' AND tool <> 'limit' AND hits > 0) AS with_hits,
              count(*) FILTER (WHERE tool LIKE 'auto:%' AND hits > 0) AS pushes
       FROM library_queries`,
    )
    .get();
  const lessonCount = db.query<{ n: number }, []>("SELECT count(*) AS n FROM library_lessons").get()?.n ?? 0;
  return {
    catalog,
    docs,
    lessons,
    totals: {
      docSections: docs.reduce((sum, d) => sum + d.sections, 0),
      lessons: lessonCount,
      lookups: usage?.lookups ?? 0,
      lookupsWithHits: usage?.with_hits ?? 0,
      pushes: usage?.pushes ?? 0,
      runs: usage?.runs ?? 0,
    },
  };
}

/** Pulls are the agent's own tool calls; auto rows are what the factory pushed; "limit" rows are calls refused at the cap. */
export function queryStats(runId: string): QueryStat[] {
  return db
    .query<{ auto: number; capped: number; pulls: number; stage: string; with_hits: number }, [string]>(
      `SELECT stage,
              count(*) FILTER (WHERE tool NOT LIKE 'auto:%' AND tool <> 'limit') AS pulls,
              count(*) FILTER (WHERE tool NOT LIKE 'auto:%' AND tool <> 'limit' AND hits > 0) AS with_hits,
              count(*) FILTER (WHERE tool LIKE 'auto:%' AND hits > 0) AS auto,
              count(*) FILTER (WHERE tool = 'limit') AS capped
       FROM library_queries WHERE run_id = ? GROUP BY stage ORDER BY min(id)`,
    )
    .all(runId)
    .map((row) => ({ auto: row.auto, capped: row.capped, pulls: row.pulls, stage: row.stage, withHits: row.with_hits }));
}

function setIndexedHash(source: string, hash: string, at: string): void {
  db.query(
    "INSERT INTO library_index_meta (source, hash, indexed_at) VALUES (?, ?, ?) ON CONFLICT (source) DO UPDATE SET hash = excluded.hash, indexed_at = excluded.indexed_at",
  ).run(source, hash, at);
}

function toLesson(row: RawLesson): Lesson {
  return {
    designSystem: row.design_system,
    fix: row.fix,
    id: row.id,
    problem: row.problem,
    rootCause: row.root_cause,
    seen: row.seen,
    step: row.step,
    tags: parseStrings(row.tags),
  };
}

function toCatalogItem(row: RawCatalog): CatalogItem {
  let files: CatalogItem["files"] = [];
  try {
    const value = JSON.parse(row.files) as unknown;
    if (Array.isArray(value)) files = value as CatalogItem["files"];
  } catch {
    files = [];
  }
  return { files, name: row.name, readme: row.readme, summary: row.summary, tags: parseStrings(row.tags) };
}

function parseStrings(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
