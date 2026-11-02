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

export type QueryStat = { calls: number; stage: string; withHits: number };
