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
      <Link href={`/runs/${id}`} className="text-sm text-stone-500 hover:text-stone-800">← Back to status</Link>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Task board</h1>
        {run && (
          <span className="text-sm text-stone-600">
            {RUN_STATUS_LABELS[run.status]}
            {live && <span className="ml-2 inline-block size-2 animate-pulse rounded-full bg-sky-500" aria-label="live" />}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-stone-600">
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
                filter === f.value ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="mt-8 text-stone-500">Loading…</p>}
      {error && <p className="mt-8 text-red-700">{error instanceof Error ? error.message : "Could not load the board"}</p>}
      {board && board.cards.length === 0 && (
        <p className="mt-8 rounded-md bg-stone-100 p-4 text-sm text-stone-600">
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
                  <section key={column.value} aria-label={column.label} className="flex min-w-0 flex-col rounded-lg bg-stone-100 p-2">
                    <header className="px-1 pb-2" title={column.description}>
                      <div className="flex items-center gap-2 text-sm font-medium text-stone-800">
                        <span className={`size-2 rounded-full ${column.tone}`} />
                        {column.label}
                        <span className="ml-auto tabular-nums text-stone-500">{inColumn.length}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">{column.description}</p>
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
      className={`block w-full rounded-md bg-white p-2.5 text-left shadow-sm ring-1 transition-shadow duration-700 hover:ring-stone-400 ${
        selected ? "ring-2 ring-stone-900" : recent ? "ring-2 ring-amber-400" : "ring-stone-200"
      }`}
    >
      <span className="flex items-center gap-2 text-xs">
        <span className="font-mono font-medium text-stone-900">{card.id}</span>
        <span className="truncate text-stone-500">{CARD_KIND_LABELS[card.kind]}</span>
      </span>
      <span className="mt-1 line-clamp-2 text-sm text-stone-800">{card.title}</span>
      {card.note && <span className="mt-1 line-clamp-2 text-xs text-stone-500">{card.note}</span>}
      <span className="mt-1.5 block truncate text-[11px] text-stone-400">
        {mover ? `${mover} · ` : ""}
        {timeAgo(card.updatedAt, now)}
      </span>
    </button>
  );
}

function CardHistory({ card, events, onClose }: { card: BoardCard; events: BoardEvent[]; onClose: () => void }) {
  const history = events.filter((e) => e.cardId === card.id).reverse();
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4" aria-label={`${card.id} history`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-medium text-stone-500">{card.id} · {CARD_KIND_LABELS[card.kind]}</p>
          <h2 className="mt-0.5 font-medium text-stone-900">{card.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-stone-500 hover:text-stone-900" aria-label="Close">
          ✕
        </button>
      </div>
      {card.note && <p className="mt-2 text-sm text-stone-700">{card.note}</p>}
      {card.links.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">Linked: {card.links.join(", ")}</p>
      )}
      <ol className="mt-4 space-y-3 border-l border-stone-200 pl-4">
        {history.map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-stone-400" />
            <span className="font-medium text-stone-800">
              {event.from ? `${BOARD_COLUMN_LABELS[event.from]} → ` : "Created in "}
              {BOARD_COLUMN_LABELS[event.to]}
            </span>
            <span className="block text-xs text-stone-500">{event.actor} · {clockTime(event.at)}</span>
            {event.note && <span className="block text-xs text-stone-600">{event.note}</span>}
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
      <h2 className="text-sm font-medium text-stone-800">Activity</h2>
      {moves.length === 0 && <p className="mt-2 text-sm text-stone-500">No cards have moved yet.</p>}
      <ol className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {moves.map((event) => (
          <li key={event.id}>
            <button type="button" onClick={() => onSelect(event.cardId)} className="block w-full px-3 py-2 text-left hover:bg-stone-50">
              <span className="flex items-baseline gap-2 text-sm">
                <span className="font-mono font-medium text-stone-900">{event.cardId}</span>
                <span className="text-stone-600">
                  {BOARD_COLUMN_LABELS[event.from!]} → <span className="text-stone-900">{BOARD_COLUMN_LABELS[event.to]}</span>
                </span>
              </span>
              <span className="block truncate text-xs text-stone-500">{titles.get(event.cardId)}</span>
              <span className="block text-[11px] text-stone-400">{event.actor} · {clockTime(event.at)}</span>
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
