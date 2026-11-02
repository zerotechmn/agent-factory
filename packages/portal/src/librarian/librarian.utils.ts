import { GENERAL_SHELF, SHELVES, SPINE_COLORS, TOOL_LABELS, type EventKind } from "./librarian.constants";
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

/** Groups documentation onto the stacks' shelves, in shelf order, dropping empty shelves. */
export function shelve<T extends { library: string }>(docs: T[]): { books: T[]; label: string }[] {
  const shelves = SHELVES.map((shelf) => ({ books: [] as T[], label: shelf.label, prefixes: shelf.prefixes }));
  const general: T[] = [];
  for (const doc of docs) {
    const name = doc.library.split("@")[0]!;
    const shelf = shelves.find((s) => s.prefixes.includes(name));
    if (shelf) shelf.books.push(doc);
    else general.push(doc);
  }
  return [...shelves, { books: general, label: GENERAL_SHELF, prefixes: [] }]
    .filter((s) => s.books.length > 0)
    .map(({ books, label }) => ({ books, label }));
}

/** A stable cloth colour per name, so a book keeps its colour between visits. */
export function spineColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINE_COLORS[hash % SPINE_COLORS.length]!;
}

/**
 * Spine height in rem: thicker manuals stand taller. Log scale, so a
 * 600-section library doesn't dwarf a one-page README into a sliver.
 */
export function spineHeight(sections: number): number {
  const scale = Math.min(Math.log10(Math.max(sections, 1) + 1) / 3, 1);
  return 7.5 + scale * 5.5;
}
