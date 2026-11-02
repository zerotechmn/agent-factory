import type { GateResult } from "../pipeline/pipeline.gate";
import type { DesignSystem } from "../pipeline/pipeline.types";
import { config } from "../lib/config";
import { LESSON_FIELD_MAX_CHARS, PROMPT_LESSON_LIMIT, RESULT_MAX_CHARS, SEARCH_LIMIT } from "./librarian.constants";
import * as LibrarianStore from "./librarian.store";
import type { CatalogItem, DocChunk, Lesson, LessonInput } from "./librarian.types";

/** A lesson reported by a repair agent, waiting for a later verify to prove the fix worked. */
export type PendingLesson = LessonInput & { reportedBy: string };

/**
 * Turns free text into an FTS5 query: every word becomes a quoted term, OR'd,
 * so punctuation in an agent's query ("antd Table: pagination?") can never be
 * read as FTS syntax. bm25 then ranks items matching more words first.
 */
export function ftsQuery(text: string): string | null {
  const words = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])].filter((w) => w.length >= 2).slice(0, 12);
  return words.length ? words.map((w) => `"${w}"`).join(" OR ") : null;
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
  const match = ftsQuery(query);
  return match ? LibrarianStore.searchLessons(match, SEARCH_LIMIT) : [];
}

export function topLessons(designSystem: DesignSystem): Lesson[] {
  return LibrarianStore.topLessons(designSystem, PROMPT_LESSON_LIMIT);
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

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
