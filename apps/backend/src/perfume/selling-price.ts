/**
 * One rule for every selling price the perfume app calculates from a cost (owner 2026-11-27 15:40 CT: "remember when generating
 * margins, or calculating, we round to the nearest .25 upwards. .67 is .75 etc."). The price that earns pct on the cost
 * (pricing.priceFromCost), then closed by the desk's own rounding setting (perfume.settings rules round_step / round_dir — the
 * same setting the Rules tab edits; "25" + "up" = next $0.25). Used by price levels (orders, quotes, reports, item inquiry), the
 * order / quote fallback, the send list and the desk's target price, so one setting governs them all.
 * A typed or fixed price is never rounded — only a price this app calculates.
 */
import type pg from "pg";
import { closeCents, priceFromCost, type RoundDir, type RoundStep } from "./pricing.js";

export type RoundRule = { step: RoundStep; dir: RoundDir };
type Q = Pick<pg.PoolClient, "query">;

/** The desk's rounding setting (exact cents when nothing is saved). */
export async function roundRule(c: Q): Promise<RoundRule> {
  const r = (await c.query<{ step: string | null; dir: string | null }>(
    `SELECT rules->>'round_step' AS step, rules->>'round_dir' AS dir FROM perfume.settings WHERE id = 1`)).rows[0];
  return { step: ((r?.step ?? "1") as RoundStep), dir: ((r?.dir ?? "up") as RoundDir) };
}
/** Close a calculated price by the rule. */
export function closeBy(cents: number, rule: RoundRule): number {
  return closeCents(cents, rule.step, rule.dir);
}
/** The selling price that earns pct on cost, closed by the rule. */
export function sellingPrice(costCents: number, pct: number, basis: "margin" | "markup", rule: RoundRule): number {
  return closeBy(priceFromCost(costCents, pct, basis), rule);
}
