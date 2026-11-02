import type { DesignSystem } from "../pipeline/pipeline.types";
import type { LessonStep } from "./librarian.constants";

/** What an agent reports after fixing something; stored only once a later verify proves the fix. */
export type LessonInput = {
  fix: string;
  problem: string;
  rootCause: string;
  step: LessonStep;
  tags: string[];
};

export type Lesson = LessonInput & {
  designSystem: DesignSystem;
  id: number;
  /** Runs in which the same problem was fixed; the most seen lessons go into the developer's prompt. */
  seen: number;
};

export type DocChunk = {
  body: string;
  /** e.g. "antd@6/table#pagination"; docs_read takes it. */
  id: string;
  library: string;
  title: string;
};

export type CatalogItem = {
  files: { content: string; path: string }[];
  name: string;
  readme: string;
  summary: string;
  tags: string[];
};

/** One logged lookup or hand-over. `results` are refs: lesson:<id>, doc:<chunk id>, catalog:<name>, spec:<id>. */
export type QueryEvent = { at: string; hits: number; id: number; query: string; results: string[]; stage: string; tool: string };

export type LibraryOverview = {
  catalog: { files: number; name: string; summary: string; tags: string[] }[];
  docs: { library: string; sections: number }[];
  lessons: (Lesson & { updatedAt: string })[];
  totals: { docSections: number; lessons: number; lookups: number; lookupsWithHits: number; pushes: number; runs: number };
};

export type RunLibrarian = {
  events: (Omit<QueryEvent, "results"> & { results: { ref: string; title: string }[] })[];
  /** Lessons this run added to the library, or proved again. */
  lessonsLearned: Lesson[];
  stats: QueryStat[];
};

export type QueryStat = {
  /** Knowledge the factory pushed (prompt or hook) that had content. */
  auto: number;
  /** Tool calls refused because the step's limit was reached. */
  capped: number;
  /** The agent's own tool calls. */
  pulls: number;
  stage: string;
  /** Pulls that found something. */
  withHits: number;
};
