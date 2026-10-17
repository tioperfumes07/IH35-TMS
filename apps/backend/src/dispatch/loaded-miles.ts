/**
 * The ONE loaded-miles rule (fab68f23f3 #24006, LST-F3270): shortest when typed (> 0), else practical.
 * 443.193 — moved out of book-load.service.ts so the mileage engine (mileage/miles-recommendations.service.ts) can use it
 * without importing Book Load: Book Load now calls the deadhead engine at booking (fc133d5270, #26932), and the two
 * modules importing each other was a cycle (verify-no-circular-dependencies). book-load.service.ts re-exports it.
 */
/**
 * The ONE rule for mdata.loads.loaded_miles (owner miles spec 2026-09-02, two-line rule): typed shortest miles when
 * present, else practical. Every writer of miles_shortest / miles_practical recomputes it with this (CC-3 queue 2g —
 * it used to be written only at booking, so a later miles edit left it stale for break-even, scoring, batch pay).
 */
export function loadedMilesFor(shortest: unknown, practical: unknown): number | null {
  const s = shortest == null ? 0 : Number(shortest);
  if (Number.isFinite(s) && s > 0) return s;
  return practical == null ? null : Number(practical);
}
