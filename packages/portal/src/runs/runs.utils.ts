export function formatUsd(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
}

export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(Math.round((now - Date.parse(iso)) / 1_000), 0);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  return new Date(iso).toLocaleString([], { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Builds started from this browser, newest first. Only this browser's: the
// portal has no login, so a shared list would show everyone's prompts.
const RECENT_KEY = "factory:recent-builds";
const RECENT_LIMIT = 20;

export type RecentBuild = { createdAt: string; id: string; prompt: string };

export function readRecentBuilds(): RecentBuild[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((b): b is RecentBuild => typeof b?.id === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRecentBuild(build: RecentBuild): void {
  writeRecentBuilds([build, ...readRecentBuilds().filter((b) => b.id !== build.id)]);
}

export function forgetRecentBuild(id: string): void {
  writeRecentBuilds(readRecentBuilds().filter((b) => b.id !== id));
}

/** A run id from a pasted id or link (…/runs/abc123defg/…), or null. */
export function runIdFrom(text: string): string | null {
  return text.trim().match(/(?:runs\/)?([a-z0-9]{10})(?:[/?#]|$)/)?.[1] ?? null;
}

function writeRecentBuilds(builds: RecentBuild[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(builds.slice(0, RECENT_LIMIT)));
  } catch {
    // Storage can be unavailable (private window, blocked site data); the list is a convenience only.
  }
}
