export function formatUsd(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
}
