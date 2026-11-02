import { useSyncExternalStore } from "react";

/** Runs started from this browser. The API has no list endpoint, so the home sidebar remembers them locally. */
export type RecentRun = { createdAt: string; id: string; prompt: string };

const STORAGE_KEY = "factory.recent-runs";
const MAX_RECENT_RUNS = 20;
const EMPTY: RecentRun[] = [];

const listeners = new Set<() => void>();
let cache: RecentRun[] | null = null;

export function useRecentRuns(): RecentRun[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function rememberRun(run: RecentRun) {
  const next = [run, ...read().filter((existing) => existing.id !== run.id)].slice(0, MAX_RECENT_RUNS);
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked (private mode); the list then lives for this tab only.
  }
  for (const listener of listeners) listener();
}

function read(): RecentRun[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as RecentRun[]) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
