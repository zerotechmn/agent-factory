import { BINDINGS, GENERAL_PATTERN, GENERAL_SHELF, MODULE_TITLES, SHELVES, type ClothPatternKind, TOOL_LABELS, type EventKind } from "./librarian.constants";
import type { LibrarianEvent, RunLibrarian } from "./librarian.types";

export function describeTool(tool: string): { kind: EventKind; label: string } {
  return TOOL_LABELS[tool] ?? { kind: tool.startsWith("auto:") ? "handed" : "asked", label: tool.replace(/_/g, " ") };
}

/**
 * Hand-overs with nothing to give are logged for the factory's own stats
 * but would only read as noise to a customer.
 */
export function visibleEvents(events: LibrarianEvent[]): LibrarianEvent[] {
  return events.filter((e) => !(describeTool(e.tool).kind === "handed" && e.hits === 0));
}

export function runTotals(view: RunLibrarian) {
  return view.stats.reduce(
    (sum, s) => ({ asked: sum.asked + s.pulls, capped: sum.capped + s.capped, found: sum.found + s.withHits, handed: sum.handed + s.auto }),
    { asked: 0, capped: 0, found: 0, handed: 0 },
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The stacks' shelf a library stands on, matched by name without its version. */
export function shelfOf(library: string): string {
  const name = library.split("@")[0]!;
  return SHELVES.find((s) => s.prefixes.includes(name))?.label ?? GENERAL_SHELF;
}

/** The pattern pressed into a shelf's covers. */
export function shelfPattern(label: string): ClothPatternKind {
  return SHELVES.find((s) => s.label === label)?.pattern ?? GENERAL_PATTERN;
}

/** The pattern pressed into a volume's cover: its shelf's. */
export function patternOf(library: string): ClothPatternKind {
  return shelfPattern(shelfOf(library));
}

/** Where a reference module would be shelved: by the first of its tags that names a shelved library. */
export function shelfOfTags(tags: string[]): string {
  return tags.map(shelfOf).find((label) => label !== GENERAL_SHELF) ?? GENERAL_SHELF;
}

/** Groups documentation onto the stacks' shelves, in shelf order, dropping empty shelves. */
export function shelve<T extends { library: string }>(docs: T[]): { books: T[]; label: string }[] {
  return [...SHELVES.map((s) => s.label), GENERAL_SHELF]
    .map((label) => ({ books: docs.filter((doc) => shelfOf(doc.library) === label), label }))
    .filter((s) => s.books.length > 0);
}

/** A stable binding per name, so a book keeps its cloth between visits. */
export function binding(name: string): (typeof BINDINGS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BINDINGS[hash % BINDINGS.length]!;
}

/**
 * Spine size in rem: thicker manuals stand taller and wider. Log scale, so a
 * 600-section library doesn't dwarf a one-page README into a sliver.
 */
export function spineSize(sections: number): { height: number; width: number } {
  const scale = Math.min(Math.log10(Math.max(sections, 1) + 1) / 3, 1);
  return { height: 14 + scale * 5, width: 2.75 + scale * 1.75 };
}

/** A reference module's name in plain words: its listed title, else its slug with spaces. */
export function moduleTitle(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ");
  return MODULE_TITLES[name] ?? spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
