/**
 * TELEMATICS-DEADLOCK-01 (Claude Lead 2026-11-02): the ONE global order in which any transaction that processes fence
 * transitions for several units must take the per-unit fence lock (geofence-detector.service.ts
 * `geo.fence_transition_unit:<unit_id>`). Pure — no DB, so module mocks of the detector cannot remove it.
 */
/** Byte order on the lowercase uuid text = Postgres uuid ORDER BY. Never localeCompare (ICU skips '-'). */
export function compareUnitLockKey(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? "").toLowerCase();
  const y = (b ?? "").toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sortForUnitLockOrder<T>(items: readonly T[], unitOf: (item: T) => string | null | undefined, timeOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, unit: unitOf(item) ?? "", time: Date.parse(timeOf(item)) }))
    .sort((a, b) => compareUnitLockKey(a.unit, b.unit) || ((a.time - b.time) || 0) || (a.index - b.index))
    .map((x) => x.item);
}

