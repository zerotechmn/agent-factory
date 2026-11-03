import { IconAwardFilled, IconBookFilled, IconDatabaseFilled, IconFlaskFilled, IconLayoutDashboardFilled } from "@tabler/icons-react";
import type { CSSProperties } from "react";

import { GENERAL_SHELF } from "../librarian.constants";

/** One filled glyph per shelf, so a cover and its shelf label say what kind of volume it is. */
const SHELF_ICONS: Record<string, typeof IconBookFilled> = {
  "Build & test": IconFlaskFilled,
  [GENERAL_SHELF]: IconBookFilled,
  "House standards": IconAwardFilled,
  Interface: IconLayoutDashboardFilled,
  "Server & data": IconDatabaseFilled,
};

export function ShelfIcon({ className, shelf, size, style }: { className?: string; shelf: string; size: number; style?: CSSProperties }) {
  const Icon = SHELF_ICONS[shelf] ?? IconBookFilled;
  return <Icon aria-hidden="true" className={className} size={size} style={style} />;
}
