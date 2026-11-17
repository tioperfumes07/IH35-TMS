/**
 * My list price against my costs — the SAME arithmetic as the server's myPriceMath (apps/backend/src/perfume/desk.service.ts;
 * both tests use the same fixtures). Owner 2026-11-17 14:04 CT: "all price boxes editable in my lists so i can change price
 * and engine automatically calculates for that item the margin etc." A typed price recomputes the row on screen at once;
 * the server's rebuild then replaces every number (the server stays the authority).
 * Margin = (price − cost) ÷ price · Markup = (price − cost) ÷ cost. Owner 2026-11-15 13:27 CT: 0 until a cost exists when
 * there is a price; blank with no price.
 */
export function myPriceMath(offer: number | null, last: number | null, avg: number | null, lowBuy: number | null): Record<string, number | null> {
  const p1 = (x: number) => Math.round(x * 1000) / 10;
  const margin = (cost: number | null) => (offer == null || offer <= 0 ? null : cost == null ? 0 : p1((offer - cost) / offer));
  const markup = (cost: number | null) => (offer == null ? null : cost == null || cost <= 0 ? 0 : p1((offer - cost) / cost));
  return {
    offer_profit: offer != null && last != null ? offer - last : null,
    offer_margin_pct: margin(last), offer_markup_pct: markup(last),
    offer_margin_avg_pct: margin(avg), offer_markup_avg_pct: markup(avg),
    buy_margin_pct: offer != null && offer > 0 && lowBuy != null ? p1((offer - lowBuy) / offer) : null,
    buy_markup_pct: offer != null && lowBuy != null && lowBuy > 0 ? p1((offer - lowBuy) / lowBuy) : null,
  };
}

/** The same fixtures the server test runs (desk.my-price.test.ts). */
export const MY_PRICE_FIXTURES: ReadonlyArray<{ in: [number | null, number | null, number | null, number | null]; out: Record<string, number | null> }> = [
  { in: [2000, 1500, 1600, 1400], out: { offer_profit: 500, offer_margin_pct: 25, offer_markup_pct: 33.3, offer_margin_avg_pct: 20, offer_markup_avg_pct: 25, buy_margin_pct: 30, buy_markup_pct: 42.9 } },
  { in: [2000, null, null, null], out: { offer_profit: null, offer_margin_pct: 0, offer_markup_pct: 0, offer_margin_avg_pct: 0, offer_markup_avg_pct: 0, buy_margin_pct: null, buy_markup_pct: null } },
  { in: [null, 1500, 1600, 1400], out: { offer_profit: null, offer_margin_pct: null, offer_markup_pct: null, offer_margin_avg_pct: null, offer_markup_avg_pct: null, buy_margin_pct: null, buy_markup_pct: null } },
  { in: [1000, 1250, null, 1100], out: { offer_profit: -250, offer_margin_pct: -25, offer_markup_pct: -20, offer_margin_avg_pct: 0, offer_markup_avg_pct: 0, buy_margin_pct: -10, buy_markup_pct: -9.1 } },
];
