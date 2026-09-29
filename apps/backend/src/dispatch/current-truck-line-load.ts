/**
 * CURRENT load predicate for Truck Line / Kanban / List / Round Trips / Trip Pairing /
 * Load Costs.
 *
 * ROUND 255 (owner 2026-09-30): ONE canonical active-load definition. The prior AUTH-061
 * 48-hour stamp-less shell hide made Truck Line return 11 while `mdata.loads` status=dispatched
 * read 14 and the canonical active set read 12 — three answers to one question. That narrowing
 * is retired. This helper is now a thin alias of `canonicalActiveLoadWhereClause` so every
 * board that still imports CURRENT_TRUCK_LINE_LOAD_SQL / currentTruckLineLoadSql resolves the
 * SAME set as truck line / dispatch / tour.
 *
 * Alias: historical call sites used `x` (views.live_loads). Use `currentTruckLineLoadSql`
 * when the alias differs.
 */

import { canonicalActiveLoadWhereClause } from "./canonical-active-load-set.js";

/** CURRENT-load SQL for a named loads alias — ROUND 255: identical to the canonical active set. */
export function currentTruckLineLoadSql(alias = "x"): string {
  return canonicalActiveLoadWhereClause(alias);
}

/** Default fragment — alias `x` (views.live_loads / mdata.loads). */
export const CURRENT_TRUCK_LINE_LOAD_SQL = currentTruckLineLoadSql("x");
