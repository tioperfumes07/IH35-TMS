/**
 * ROUND 288.3 item 2 / ROUND 296 4 — THE ONE DEADHEAD RULE. The driver bill (book-load), the Settlement Creator and
 * batch pay each priced empty miles their own way, so the bill and the settlement disagreed for every mileage driver
 * who ran empty. Owner MILES SPEC (2026-09-02): the empty-mile rate is its own configured value when set, otherwise
 * it equals the loaded per-mile rate (live, never a stored copy, never a hardcoded figure); no per-mile rate at all
 * -> unpriced (null), never invented. Deadhead pay = round(miles x rate), rounded once.
 * All three engines call these two functions — change the rule here and every engine changes with it.
 */
export function deadheadRateCents(input: { emptyRateCents?: number | null; loadedRateCents?: number | null }): number | null {
  const own = Number(input.emptyRateCents ?? 0);
  if (Number.isFinite(own) && own > 0) return own;
  const loaded = Number(input.loadedRateCents ?? 0);
  return Number.isFinite(loaded) && loaded > 0 ? loaded : null;
}

export function deadheadPayCents(miles: number | null | undefined, rateCents: number | null): number {
  const m = Number(miles ?? 0);
  return Number.isFinite(m) && m > 0 && rateCents != null && rateCents > 0 ? Math.round(m * rateCents) : 0;
}
