import { db } from "../lib/db";
import type { BoardCard, BoardColumn, BoardEvent, CardSeed } from "./board.types";

db.exec(`
  CREATE TABLE IF NOT EXISTS board_cards (
    run_id TEXT NOT NULL REFERENCES runs (id),
    card_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    col TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (run_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS board_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs (id),
    card_id TEXT NOT NULL,
    from_col TEXT,
    to_col TEXT NOT NULL,
    actor TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS board_events_run ON board_events (run_id, id);
`);

type RawCard = {
  card_id: string;
  col: BoardColumn;
  kind: BoardCard["kind"];
  links: string;
  note: string;
  position: number;
  title: string;
  updated_at: string;
};

type RawEvent = {
  actor: string;
  at: string;
  card_id: string;
  from_col: BoardColumn | null;
  id: number;
  note: string;
  to_col: BoardColumn;
};

export function listCards(runId: string): BoardCard[] {
  return db
    .query<RawCard, [string]>("SELECT * FROM board_cards WHERE run_id = ? ORDER BY position")
    .all(runId)
    .map((row) => ({
      column: row.col,
      id: row.card_id,
      kind: row.kind,
      links: parseLinks(row.links),
      note: row.note,
      position: row.position,
      title: row.title,
      updatedAt: row.updated_at,
    }));
}

export function listEvents(runId: string, limit: number): BoardEvent[] {
  return db
    .query<RawEvent, [string, number]>("SELECT * FROM board_events WHERE run_id = ? ORDER BY id DESC LIMIT ?")
    .all(runId, limit)
    .map((row) => ({
      actor: row.actor,
      at: row.at,
      cardId: row.card_id,
      from: row.from_col,
      id: row.id,
      note: row.note,
      to: row.to_col,
    }));
}

export function hasCards(runId: string): boolean {
  return Boolean(db.query<{ n: number }, [string]>("SELECT count(*) AS n FROM board_cards WHERE run_id = ?").get(runId)?.n);
}

/**
 * Adds cards that don't exist yet in "todo"; existing cards keep their column
 * and only get the newer title and links (a repaired PRD may rename them).
 */
export function seedCards(runId: string, seeds: CardSeed[], { actor, at }: { actor: string; at: string }): void {
  const insert = db.query(
    `INSERT INTO board_cards (run_id, card_id, kind, title, col, note, links, position, updated_at)
     VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)
     ON CONFLICT (run_id, card_id) DO UPDATE SET title = excluded.title, links = excluded.links`,
  );
  const event = db.query(
    `INSERT INTO board_events (run_id, card_id, from_col, to_col, actor, note, at) VALUES (?, ?, NULL, 'todo', ?, '', ?)`,
  );
  db.transaction(() => {
    const base = db.query<{ n: number | null }, [string]>("SELECT max(position) AS n FROM board_cards WHERE run_id = ?").get(runId)?.n ?? -1;
    seeds.forEach((seed, i) => {
      const existed = db.query<{ n: number }, [string, string]>("SELECT count(*) AS n FROM board_cards WHERE run_id = ? AND card_id = ?").get(runId, seed.id)?.n;
      insert.run(runId, seed.id, seed.kind, seed.title, seed.note, JSON.stringify(seed.links), base + 1 + i, at);
      if (!existed) event.run(runId, seed.id, actor, at);
    });
  })();
}

/**
 * Moves a card and records the move. A note change without a column change
 * updates the card but adds no event, so the history only shows movement.
 */
export function moveCard(
  runId: string,
  cardId: string,
  to: BoardColumn,
  { actor, at, note }: { actor: string; at: string; note?: string },
): boolean {
  const current = db
    .query<{ col: BoardColumn; note: string }, [string, string]>("SELECT col, note FROM board_cards WHERE run_id = ? AND card_id = ?")
    .get(runId, cardId);
  if (!current) return false;
  const nextNote = note ?? current.note;
  if (current.col === to && current.note === nextNote) return false;

  db.transaction(() => {
    db.query("UPDATE board_cards SET col = ?, note = ?, updated_at = ? WHERE run_id = ? AND card_id = ?").run(
      to,
      nextNote,
      at,
      runId,
      cardId,
    );
    if (current.col !== to) {
      db.query(
        `INSERT INTO board_events (run_id, card_id, from_col, to_col, actor, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, cardId, current.col, to, actor, nextNote, at);
    }
  })();
  return current.col !== to;
}

function parseLinks(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
