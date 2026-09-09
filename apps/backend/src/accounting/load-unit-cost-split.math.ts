/**
 * SET-28 (owner defect register 2026-09-03 / assignment 2026-09-07: "vehicle-swap mid-trip cost
 * split by miles each truck ran"). When ONE load is pulled by MORE THAN ONE truck (a mid-trip
 * vehicle swap, recorded in dispatch.load_assignment_history), the load's operating-cost pool is
 * attributed to each truck in proportion to the miles that truck ran, NOT dumped whole onto the
 * final assigned unit. Owner words: "costs split by miles each truck ran" (LAW §3 attribution
 * rung 3 = allocate by miles).
 *
 * This module is the PURE, deterministic split. No DB, no fastify — so it is unit-testable and the
 * guard can exercise it directly. The assembling service (load-unit-cost-split.routes.ts) reads the
 * running units, their miles, and the cost pool from Postgres and calls splitCostByMiles().
 *
 * Cents reconcile EXACTLY: sum of allocated_cost_cents === poolCents for every input (largest-
 * remainder apportionment). Never a rounding penny lost or invented — this is money attribution.
 */

export type UnitMiles = {
  unit_id: string;
  unit_number: string | null;
  /** miles this truck ran on the load (real telematics miles, else time-window basis). >= 0. */
  miles: number;
};

export type UnitCostShare = {
  unit_id: string;
  unit_number: string | null;
  miles: number;
  /** share of total miles, 0..100, one decimal. */
  miles_pct: number;
  /** integer cents allocated to this truck. The shares sum EXACTLY to the pool. */
  allocated_cost_cents: number;
};

/**
 * Split an integer-cent cost pool across units by miles, exact-to-the-penny (largest remainder).
 *
 * - poolCents is coerced to a non-negative integer (a load cost pool is expenses + bills, >= 0).
 * - If total miles is 0 (no telematics AND no time-window basis), the pool splits EQUALLY so it
 *   still reconciles — the caller marks basis "equal" so the surface tells the truth.
 * - Remainder pennies go to the units with the largest fractional part first; ties break by more
 *   miles, then by original order — fully deterministic.
 */
export function splitCostByMiles(poolCents: number, units: UnitMiles[]): UnitCostShare[] {
  const n = units.length;
  if (n === 0) return [];
  const pool = Math.max(0, Math.round(Number.isFinite(poolCents) ? poolCents : 0));

  const miles = units.map((u) => (Number.isFinite(u.miles) && u.miles > 0 ? u.miles : 0));
  const totalMiles = miles.reduce((s, m) => s + m, 0);
  const weights = totalMiles > 0 ? miles.map((m) => m / totalMiles) : units.map(() => 1 / n);

  const raw = weights.map((w) => pool * w);
  const floors = raw.map((x) => Math.floor(x));
  const assigned = floors.reduce((s, x) => s + x, 0);
  let remainder = pool - assigned; // integer in [0, n-1]

  const order = units
    .map((_, i) => ({ i, frac: raw[i] - floors[i], miles: miles[i] }))
    .sort((a, b) => b.frac - a.frac || b.miles - a.miles || a.i - b.i);

  const alloc = floors.slice();
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    alloc[order[k].i] += 1;
  }

  return units.map((u, i) => ({
    unit_id: u.unit_id,
    unit_number: u.unit_number,
    miles: miles[i],
    miles_pct: Math.round(weights[i] * 1000) / 10,
    allocated_cost_cents: alloc[i],
  }));
}

/** True when the allocated cents reconcile exactly to the pool (defensive; always holds for the
 *  algorithm above, asserted by the guard as a locked money invariant). */
export function sharesReconcile(poolCents: number, shares: UnitCostShare[]): boolean {
  const pool = Math.max(0, Math.round(Number.isFinite(poolCents) ? poolCents : 0));
  const sum = shares.reduce((s, x) => s + x.allocated_cost_cents, 0);
  return sum === pool;
}
