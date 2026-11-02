import type { GateResult } from "../pipeline/pipeline.gate";
import type { DesignSystem } from "../pipeline/pipeline.types";
import { config } from "../lib/config";
import {
  FAILURE_LESSON_LIMIT,
  LESSON_FIELD_MAX_CHARS,
  PROMPT_LESSON_LIMIT,
  RANKING_POOL,
  RESULT_MAX_CHARS,
  SEARCH_LIMIT,
  STACK_TERMS,
  type LessonStep,
} from "./librarian.constants";
import * as LibrarianStore from "./librarian.store";
import type { CatalogItem, DocChunk, Lesson, LessonInput } from "./librarian.types";

/** A lesson reported by a repair agent, waiting for a later verify to prove the fix worked. */
export type PendingLesson = LessonInput & { reportedBy: string };

/**
 * Turns free text into an FTS5 query: every word becomes a quoted prefix
 * term, OR'd, so punctuation in an agent's query ("antd Table: pagination?")
 * can never be read as FTS syntax, and "search" still finds SearchOutlined or
 * "relative" finds relativeTime. bm25 then ranks items matching more words first.
 * Lessons use exact words: a prefix like "use" matching "used" pushes
 * unrelated lessons into a repair prompt.
 */
export function ftsQuery(text: string, { exact = false, maxWords = 12 }: { exact?: boolean; maxWords?: number } = {}): string | null {
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])].filter((w) => w.length >= 2).slice(0, maxWords);
  return words.length ? words.map((w) => (exact ? `"${w}"` : `"${w}"*`)).join(" OR ") : null;
}

export function clip(text: string, max = RESULT_MAX_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max - 40)}\n… [cut at ${max} characters]`;
}

// ---- lessons ----

/**
 * Decides which pending lessons a verify result proves. A lesson counts once
 * the step it was about passes; a container-only verify can't judge test or
 * browser lessons, and only a review can judge a review lesson, so those wait.
 * Lessons whose step still fails are dropped: the fix didn't work.
 */
export function settleLessons(
  pending: PendingLesson[],
  { gate, reviewOk }: { gate: Pick<GateResult, "failedSteps" | "mode"> | null; reviewOk: boolean | null },
): { keep: PendingLesson[]; proven: PendingLesson[] } {
  const keep: PendingLesson[] = [];
  const proven: PendingLesson[] = [];
  for (const lesson of pending) {
    if (lesson.step === "review") {
      if (reviewOk === null) keep.push(lesson);
      else if (reviewOk) proven.push(lesson);
      continue;
    }
    if (!gate || (gate.mode === "container" && ["smoke", "tests", "ui"].includes(lesson.step))) {
      keep.push(lesson);
      continue;
    }
    if (!(gate.failedSteps as string[]).includes(lesson.step)) proven.push(lesson);
  }
  return { keep, proven };
}

/**
 * Lessons are shared across every future run, so they must hold engineering
 * knowledge only. A lesson quoting five or more consecutive words of the
 * user's prompt is most likely carrying their product or data, and is skipped.
 */
export function quotesPrompt(lesson: LessonInput, prompt: string): boolean {
  const promptWords = words(prompt);
  if (promptWords.length < 5) return false;
  const windows = new Set<string>();
  for (let i = 0; i + 5 <= promptWords.length; i++) windows.add(promptWords.slice(i, i + 5).join(" "));
  const text = words(`${lesson.problem} ${lesson.rootCause} ${lesson.fix}`);
  for (let i = 0; i + 5 <= text.length; i++) if (windows.has(text.slice(i, i + 5).join(" "))) return true;
  return false;
}

export function cleanLesson(lesson: LessonInput): LessonInput {
  const field = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, LESSON_FIELD_MAX_CHARS);
  return {
    fix: field(lesson.fix),
    problem: field(lesson.problem),
    rootCause: field(lesson.rootCause),
    step: lesson.step,
    tags: [...new Set(lesson.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
  };
}

/** Same step and same leading words of the problem: the same lesson seen again. */
export function lessonSignature(lesson: LessonInput): string {
  return `${lesson.step}:${words(lesson.problem).slice(0, 12).join(" ")}`;
}

export function recordLessons({
  designSystem,
  lessons,
  prompt,
  runId,
}: {
  designSystem: DesignSystem;
  lessons: LessonInput[];
  prompt: string;
  runId: string;
}): number {
  if (config.LIBRARIAN_LESSONS === "off") return 0;
  const at = new Date().toISOString();
  let recorded = 0;
  for (const raw of lessons) {
    const lesson = cleanLesson(raw);
    if (!lesson.problem || !lesson.fix || quotesPrompt(lesson, prompt)) continue;
    LibrarianStore.upsertLesson({ ...lesson, designSystem, runId, signature: lessonSignature(lesson) }, at);
    recorded += 1;
  }
  return recorded;
}

export function searchLessons(query: string): Lesson[] {
  const match = ftsQuery(query, { exact: true });
  return match ? LibrarianStore.searchLessons(match, SEARCH_LIMIT) : [];
}

export function topLessons(designSystem: DesignSystem): Lesson[] {
  return LibrarianStore.topLessons(designSystem, PROMPT_LESSON_LIMIT);
}

/**
 * Lessons for this run's stack first: the pool is the design system's most
 * seen lessons, re-ordered by how many of the stack's technologies they are
 * tagged with, so an Express/antd run sees Express/antd traps before generic ones.
 */
export function rankedLessons({
  designSystem,
  limit = PROMPT_LESSON_LIMIT,
  steps,
  tags,
}: {
  designSystem: DesignSystem;
  limit?: number;
  steps?: LessonStep[];
  tags: string[];
}): Lesson[] {
  const wanted = new Set(tags);
  return LibrarianStore.topLessons(designSystem, RANKING_POOL)
    .filter((lesson) => !steps || steps.includes(lesson.step))
    .map((lesson, order) => ({ lesson, order, score: lesson.tags.filter((tag) => wanted.has(tag)).length }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ lesson }) => lesson);
}

/** Technologies named in the architecture's stack, in the vocabulary lesson tags use. */
export function stackTags(architecture: unknown): string[] {
  const stack = (architecture as { stack?: Record<string, unknown> } | null)?.stack;
  if (!stack || typeof stack !== "object") return [];
  const text = Object.values(stack).filter((v) => typeof v === "string").join(" ").toLowerCase();
  return STACK_TERMS.filter((term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`).test(text));
}

const ERROR_LINE =
  /\b(error|errors|fail|failed|failing|not ok|expected|assert\w*|cannot|unable|exception|timed? ?out|refused|enoent|eaddrinuse|not found|is not a function|is not defined|undefined|overflow|split|violation)\b/i;

/**
 * The lines of a log that say what went wrong, with what makes them unique to
 * this app (paths, numbers, ids, quoted values) removed, so they match lessons
 * written about other apps with the same problem.
 */
export function errorLines(output: string, max = 8): string[] {
  const lines = output
    .split("\n")
    .filter((line) => ERROR_LINE.test(line))
    .map((line) =>
      line
        .replace(/\S*[/\\]\S+/g, " ")
        .replace(/["'`][^"'`]{0,80}["'`]/g, " ")
        .replace(/\b[0-9a-f]{7,}\b|\d+(\.\d+)?/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length >= 6);
  return [...new Set(lines)].slice(0, max);
}

/** Search text for a verify failure: the failed steps, then the meaningful lines of their logs. */
export function failureQuery(gate: Pick<GateResult, "failedSteps" | "logs">): string {
  const lines = gate.failedSteps.flatMap((step) => errorLines(gate.logs[step] ?? "", 4));
  return [...gate.failedSteps, ...lines].join(" ");
}

/**
 * Proven lessons for exactly what just failed, for a repair agent's prompt.
 * Only lessons about one of the failing checks qualify: a build lesson that
 * matches words in a test log would be noise.
 */
export function lessonsForFailure({
  gate,
  limit = FAILURE_LESSON_LIMIT,
  review,
}: {
  gate: Pick<GateResult, "failedSteps" | "logs"> | null;
  limit?: number;
  /** Blocking review findings, when review is part of what failed. */
  review?: { findings?: { description?: string }[] } | null;
}): Lesson[] {
  const steps = new Set<string>(gate?.failedSteps ?? []);
  const findings = (review?.findings ?? []).map((f) => f.description ?? "").filter(Boolean);
  if (findings.length) steps.add("review");
  if (steps.size === 0) return [];
  const text = [gate ? failureQuery(gate) : "", ...findings.slice(0, 4)].join(" ");
  const match = ftsQuery(text, { exact: true, maxWords: 24 });
  if (!match) return [];
  return LibrarianStore.searchLessons(match, RANKING_POOL)
    .filter((lesson) => steps.has(lesson.step))
    .slice(0, limit);
}

/** Lessons for a failing command's output mid-session, when the agent hasn't asked. */
export function lessonsForOutput(output: string, limit: number): Lesson[] {
  const match = ftsQuery(errorLines(output).join(" "), { exact: true, maxWords: 24 });
  return match ? LibrarianStore.searchLessons(match, limit) : [];
}

export function formatLessons(lessons: Lesson[]): string {
  return lessons
    .map((l) => `- [${l.step}, ${l.designSystem}, seen in ${l.seen} run${l.seen === 1 ? "" : "s"}] ${l.problem}\n  Cause: ${l.rootCause}\n  Fix: ${l.fix}`)
    .join("\n");
}

// ---- docs ----

export function searchDocs(query: string, library: string | null): DocChunk[] {
  const match = ftsQuery(query);
  return match ? LibrarianStore.searchDocs(match, library?.trim() || null, SEARCH_LIMIT) : [];
}

/** Search results show the start of each section; docs_read returns a whole one. */
export function formatDocHits(chunks: DocChunk[]): string {
  const perHit = Math.floor(RESULT_MAX_CHARS / Math.max(chunks.length, 1)) - 80;
  return chunks.map((c) => `### ${c.title}\nid: ${c.id}\n${clip(c.body, Math.max(perHit, 200))}`).join("\n\n");
}

// ---- catalog ----

export function searchCatalog(query: string): CatalogItem[] {
  const match = ftsQuery(query);
  return match ? LibrarianStore.searchCatalog(match, SEARCH_LIMIT) : [];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
