/**
 * Left to right is the order work normally moves in. "built" is the
 * developer's claim; only the verify gate moves a card to "verified" or
 * "failed", from real test, HTTP and browser results.
 */
export const BOARD_COLUMNS = ["todo", "doing", "built", "verified", "failed"] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** feature: PRD F-xx · screen: PRD S-xx · test: test plan TC-x · smoke: test plan SMOKE-x. */
export const CARD_KINDS = ["feature", "screen", "test", "smoke"] as const;

export type CardKind = (typeof CARD_KINDS)[number];

export type BoardCard = {
  column: BoardColumn;
  id: string;
  kind: CardKind;
  /** Related card ids: a test's features, a feature's screens. */
  links: string[];
  /** Latest detail: why it failed, what it covers, a known gap. */
  note: string;
  position: number;
  title: string;
  updatedAt: string;
};

export type BoardEvent = {
  /** Stage label that moved the card, e.g. "Developer", "Verify (round-2)". */
  actor: string;
  at: string;
  cardId: string;
  /** Null when the card was created. */
  from: BoardColumn | null;
  id: number;
  note: string;
  to: BoardColumn;
};

export type Board = { cards: BoardCard[]; events: BoardEvent[] };

/** A card as an earlier stage defines it, before it has a place on the board. */
export type CardSeed = Pick<BoardCard, "id" | "kind" | "links" | "note" | "title">;
