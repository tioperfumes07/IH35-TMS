/**
 * PERFUME-DESK — pricing math. Every amount is an integer number of CENTS; percentages are plain
 * numbers (16 = 16%). Integer cents mean $20.37 is 2037, never 20.369999.
 *
 * Owner rules (2026-11-11/12):
 *  - Every computed price closes on a "closed number": a multiple of .05/.10/.25/.50/1.00, or ending
 *    in .75. Default: up to .50 ($20.37 → $20.50).
 *  - A vendor usually comes down .25–.50 from its listed price (the cushion).
 *  - Freight adds .35–.45 per piece.
 *  - Show BOTH margin (profit ÷ price) and markup (profit ÷ cost).
 */

export type RoundStep = "5" | "10" | "25" | "50" | "100" | "75";
export type RoundDir = "up" | "nearest" | "down";
export type EarnBasis = "margin" | "markup";

/** Round half away from zero to a whole cent. */
export function cents(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Close a price (in cents) on the owner's closed-number rule. */
export function closeCents(c: number, step: RoundStep = "50", dir: RoundDir = "up"): number {
  if (!Number.isFinite(c)) return c;
  if (step === "75") {
    const dollars = Math.floor(c / 100);
    const candidates = [dollars - 2, dollars - 1, dollars, dollars + 1].map((d) => d * 100 + 75);
    if (dir === "up") return candidates.find((x) => x >= c)!;
    if (dir === "down") return [...candidates].reverse().find((x) => x <= c)!;
    return candidates.reduce((a, x) => (Math.abs(x - c) < Math.abs(a - c) ? x : a));
  }
  const s = Number(step);
  const q = c / s;
  const r = dir === "up" ? Math.ceil(q - 1e-9) : dir === "down" ? Math.floor(q + 1e-9) : Math.round(q);
  return r * s;
}

/** What I pay landed: listed price, less the vendor's cushion, plus freight per piece. */
export function landedCents(listedCents: number, cushionCents: number, freightCents: number): number {
  return listedCents - cushionCents + freightCents;
}

/** Profit ÷ selling price. null when there is no price. */
export function marginPct(sellCents: number | null, costCents: number | null): number | null {
  if (sellCents == null || costCents == null || sellCents <= 0) return null;
  return ((sellCents - costCents) / sellCents) * 100;
}
/** Profit ÷ cost. null when there is no cost. */
export function markupPct(sellCents: number | null, costCents: number | null): number | null {
  if (sellCents == null || costCents == null || costCents <= 0) return null;
  return ((sellCents - costCents) / costCents) * 100;
}

/** What a seller paid, from its selling price and what it earns (16 = 16%). Unclosed, whole cents. */
export function costFromPrice(priceCents: number, pct: number, basis: EarnBasis): number {
  return basis === "margin" ? cents(priceCents * (1 - pct / 100)) : cents(priceCents / (1 + pct / 100));
}
/** The price that earns pct on a cost. Unclosed, whole cents. */
export function priceFromCost(costCents: number, pct: number, basis: EarnBasis): number {
  if (basis === "margin") {
    if (pct >= 100) throw new Error("margin_must_be_below_100");
    return cents(costCents / (1 - pct / 100));
  }
  return cents(costCents * (1 + pct / 100));
}

export type Offer = { vendorId: string; listedCents: number; cushionLoCents: number; cushionHiCents: number; freightLoCents: number; freightHiCents: number };
export type Ranked = Offer & { likelyCents: number; bestCaseCents: number; rank: number; tied: boolean };

/**
 * Rank vendors for one item. "Likely" landed cost = listed − LOW cushion + HIGH freight (the safe number);
 * "best case" = listed − HIGH cushion + LOW freight. Ranked by likely, ties share a rank and are flagged.
 */
export function rankOffers(offers: Offer[]): Ranked[] {
  const withCost = offers.map((o) => ({
    ...o,
    likelyCents: landedCents(o.listedCents, o.cushionLoCents, o.freightHiCents),
    bestCaseCents: landedCents(o.listedCents, o.cushionHiCents, o.freightLoCents),
    rank: 0,
    tied: false,
  }));
  withCost.sort((a, b) => a.likelyCents - b.likelyCents || a.vendorId.localeCompare(b.vendorId));
  let rank = 0, prev: number | null = null;
  withCost.forEach((o, i) => { if (o.likelyCents !== prev) { rank = i + 1; prev = o.likelyCents; } o.rank = rank; });
  for (const o of withCost) o.tied = withCost.filter((x) => x.rank === o.rank).length > 1;
  return withCost;
}
