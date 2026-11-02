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
