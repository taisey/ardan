export function nextRssPollAt(now: number): number {
  const interval = 15 * 60 * 1_000;
  return (Math.floor(now / interval) + 1) * interval;
}
