/**
 * Whether someone has a build's page open. The status and task-board pages
 * poll the run every 2 seconds with ?watch=1; the factory remembers the last
 * time, in memory only (it is a live signal, worthless after a restart).
 * A browser pauses polling in a background tab, so a hidden tab counts as
 * not watching, which is the right answer for "will anyone answer?".
 */
const lastSeen = new Map<string, number>();

export function markWatched(runId: string, at = Date.now()): void {
  lastSeen.set(runId, at);
}

export function isWatched(runId: string, withinMs: number, now = Date.now()): boolean {
  const seen = lastSeen.get(runId);
  return seen !== undefined && now - seen <= withinMs;
}
