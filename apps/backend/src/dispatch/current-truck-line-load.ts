/**
 * CURRENT load predicate for Truck Line.
 *
 * TRUCKLINE-16 (Lead, 2026-09-30): Truck Line answers a DISPATCH question ("is a unit carrying
 * this load right now"), not an accounting one — it was wrongly aliased to the accounting
 * predicate (ROUND 255), which meant a load whose driver bill happened to get marked SETTLED
 * while the truck was still physically rolling silently dropped off the board (owner saw 12
 * instead of 16). This helper is now a thin alias of `canonicalDispatchWorkWhereClause` — pure
 * status + entity scope, no money test. See canonical-active-load-set.ts's file-header section
 * "TWO CANONICAL QUESTIONS, NOT ONE" for why these stay two separate predicates permanently.
 *
 * Alias: historical call sites used `x` (views.live_loads). Use `currentTruckLineLoadSql`
 * when the alias/entity-param placeholder differs.
 */

import { canonicalDispatchWorkWhereClause } from "./canonical-active-load-set.js";

/** CURRENT-load SQL for a named loads alias — TRUCKLINE-16: the dispatch-work predicate, not the
 *  accounting one. `operatingCompanyIdParam` is the caller's own SQL parameter placeholder. */
export function currentTruckLineLoadSql(alias = "x", operatingCompanyIdParam = "$1::uuid"): string {
  return canonicalDispatchWorkWhereClause(alias, operatingCompanyIdParam);
}

/** Default fragment — alias `x` (views.live_loads / mdata.loads), param placeholder `$1::uuid`. */
export const CURRENT_TRUCK_LINE_LOAD_SQL = currentTruckLineLoadSql("x");
