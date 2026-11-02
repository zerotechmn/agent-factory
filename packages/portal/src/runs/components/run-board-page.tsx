import { useMemo, useState } from "react";
import { Link } from "wouter";

import {
  BOARD_COLUMN_LABELS,
  BOARD_COLUMNS,
  BOARD_FILTERS,
  CARD_KIND_LABELS,
  RECENT_MOVE_MS,
  RUN_STATUS_LABELS,
  TERMINAL_STATUSES,
} from "../runs.constants";
import { useBoard, useRun } from "../runs.hooks";
import type { BoardCard, BoardEvent } from "../runs.types";
import { clockTime, timeAgo } from "../runs.utils";

export function RunBoardPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const live = Boolean(run && !TERMINAL_STATUSES.includes(run.status));
  const { data: board, error, isLoading } = useBoard(id, { live });
  const [filter, setFilter] = useState(BOARD_FILTERS[0]!.value);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Re-read on every poll so "moved 5s ago" and the highlight stay current.
  const now = Date.now();

  const cards = useMemo(() => {
    const kinds = BOARD_FILTERS.find((f) => f.value === filter)?.kinds ?? [];
    return (board?.cards ?? []).filter((c) => kinds.includes(c.kind));
  }, [board, filter]);
  const lastMover = useMemo(() => lastMoverByCard(board?.events ?? []), [board]);
  const selected = board?.cards.find((c) => c.id === selectedId) ?? null;

  return (
    <main className="mx-auto max-w-[100rem] px-4 py-12">
      <Link href={`/runs/${id}`} className="text-sm text-ds-fg-sec transition-colors hover:text-ds-fg">← Back to status</Link>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="type-md-lg">Task board</h1>
        {run && (
          <span className="text-sm text-ds-fg-sec">
            {RUN_STATUS_LABELS[run.status]}
            {live && <span className="ml-2 inline-block size-2 animate-pulse rounded-full bg-ds-accent" aria-label="live" />}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ds-fg-sec">
        Every feature, screen and test case from the plan. The developer moves cards to In progress and Built as it
        works; only the factory's own test run, HTTP checks and browser checks move them to Verified or Failed.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Card type">
        {BOARD_FILTERS.map((f) => {
          const count = (board?.cards ?? []).filter((c) => f.kinds.includes(c.kind)).length;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-sm ${
                filter === f.value ? "bg-ds-fg text-ds-bg" : "bg-ds-card text-ds-fg ring-1 ring-ds-line hover:bg-ds-card-2"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="mt-8 text-ds-fg-sec">Loading…</p>}
      {error && <p className="mt-8 text-ds-error">{error instanceof Error ? error.message : "Could not load the board"}</p>}
      {board && board.cards.length === 0 && (
        <p className="mt-8 rounded-[var(--ds-radius-xs)] bg-ds-card-2 p-4 text-sm text-ds-fg-sec">
          No cards yet. They appear when the requirements and test plan are written.
        </p>
      )}

      {board && board.cards.length > 0 && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          {/* The board scrolls sideways on narrow screens; the page itself never does. */}
          <div className="min-w-0 overflow-x-auto pb-2">
            <div className="grid min-w-[52rem] grid-cols-5 gap-3">
              {BOARD_COLUMNS.map((column) => {
                const inColumn = cards.filter((c) => c.column === column.value);
                return (
                  <section key={column.value} aria-label={column.label} className="flex min-w-0 flex-col rounded-[var(--ds-radius-xs)] bg-ds-card-2 p-2">
                    <header className="px-1 pb-2" title={column.description}>
                      <div className="flex items-center gap-2 text-sm font-medium text-ds-fg">
                        <span className={`size-2 rounded-full ${column.tone}`} />
                        {column.label}
                        <span className="ml-auto tabular-nums text-ds-fg-sec">{inColumn.length}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ds-fg-sec">{column.description}</p>
                    </header>
                    <ol className="space-y-2">
                      {inColumn.map((card) => (
                        <li key={card.id}>
                          <CardButton
                            card={card}
                            mover={lastMover.get(card.id) ?? null}
                            now={now}
                            onSelect={() => setSelectedId(card.id === selectedId ? null : card.id)}
                            selected={card.id === selectedId}
                          />
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="space-y-6">
            {selected && <CardHistory card={selected} events={board.events} onClose={() => setSelectedId(null)} />}
            <ActivityFeed cards={board.cards} events={board.events} onSelect={setSelectedId} />
          </aside>
        </div>
      )}
    </main>
  );
}

function CardButton({
  card,
  mover,
  now,
  onSelect,
  selected,
}: {
  card: BoardCard;
  mover: string | null;
  now: number;
  onSelect: () => void;
  selected: boolean;
}) {
  const recent = now - Date.parse(card.updatedAt) < RECENT_MOVE_MS;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full cursor-pointer rounded-[var(--ds-radius-xs)] bg-ds-bg p-2.5 text-left shadow-sm ring-1 transition-shadow duration-700 hover:ring-ds-line-strong ${
        selected ? "ring-2 ring-ds-fg" : recent ? "ring-2 ring-ds-accent" : "ring-ds-line"
      }`}
    >
      <span className="flex items-center gap-2 text-xs">
        <span className="font-mono font-medium text-ds-fg">{card.id}</span>
        <span className="truncate text-ds-fg-sec">{CARD_KIND_LABELS[card.kind]}</span>
      </span>
      <span className="mt-1 line-clamp-2 text-sm text-ds-fg">{card.title}</span>
      {card.note && <span className="mt-1 line-clamp-2 text-xs text-ds-fg-sec">{card.note}</span>}
      <span className="mt-1.5 block truncate text-[11px] text-ds-fg-ter">
        {mover ? `${mover} · ` : ""}
        {timeAgo(card.updatedAt, now)}
      </span>
    </button>
  );
}

function CardHistory({ card, events, onClose }: { card: BoardCard; events: BoardEvent[]; onClose: () => void }) {
  const history = events.filter((e) => e.cardId === card.id).reverse();
  return (
    <section className="rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card p-4" aria-label={`${card.id} history`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-medium text-ds-fg-sec">{card.id} · {CARD_KIND_LABELS[card.kind]}</p>
          <h2 className="mt-0.5 font-medium text-ds-fg">{card.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-ds-fg-sec hover:text-ds-fg" aria-label="Close">
          ✕
        </button>
      </div>
      {card.note && <p className="mt-2 text-sm text-ds-fg">{card.note}</p>}
      {card.links.length > 0 && (
        <p className="mt-2 text-xs text-ds-fg-sec">Linked: {card.links.join(", ")}</p>
      )}
      <ol className="mt-4 space-y-3 border-l border-ds-line pl-4">
        {history.map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-ds-fg-ter" />
            <span className="font-medium text-ds-fg">
              {event.from ? `${BOARD_COLUMN_LABELS[event.from]} → ` : "Created in "}
              {BOARD_COLUMN_LABELS[event.to]}
            </span>
            <span className="block text-xs text-ds-fg-sec">{event.actor} · {clockTime(event.at)}</span>
            {event.note && <span className="block text-xs text-ds-fg-sec">{event.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityFeed({
  cards,
  events,
  onSelect,
}: {
  cards: BoardCard[];
  events: BoardEvent[];
  onSelect: (id: string) => void;
}) {
  // Creation events are the plan arriving, not movement; they'd bury the moves.
  const moves = events.filter((e) => e.from !== null).slice(0, 40);
  const titles = new Map(cards.map((c) => [c.id, c.title]));
  return (
    <section aria-label="Activity">
      <h2 className="text-sm font-medium text-ds-fg">Activity</h2>
      {moves.length === 0 && <p className="mt-2 text-sm text-ds-fg-sec">No cards have moved yet.</p>}
      <ol className="mt-2 divide-y divide-ds-line rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card">
        {moves.map((event) => (
          <li key={event.id}>
            <button type="button" onClick={() => onSelect(event.cardId)} className="block w-full px-3 py-2 text-left transition-colors hover:bg-ds-card-hover">
              <span className="flex items-baseline gap-2 text-sm">
                <span className="font-mono font-medium text-ds-fg">{event.cardId}</span>
                <span className="text-ds-fg-sec">
                  {BOARD_COLUMN_LABELS[event.from!]} → <span className="text-ds-fg">{BOARD_COLUMN_LABELS[event.to]}</span>
                </span>
              </span>
              <span className="block truncate text-xs text-ds-fg-sec">{titles.get(event.cardId)}</span>
              <span className="block text-[11px] text-ds-fg-ter">{event.actor} · {clockTime(event.at)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function lastMoverByCard(events: BoardEvent[]): Map<string, string> {
  // Events arrive newest first, so the first one seen per card is the latest.
  const movers = new Map<string, string>();
  for (const event of events) if (!movers.has(event.cardId)) movers.set(event.cardId, event.actor);
  return movers;
}
