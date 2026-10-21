import { loadServiceIdInSql } from "./load-service.js";
/**
 * ROUND 36.1 (Lead ruling, 2026-09-22, docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md):
 * a shared SQL fragment for surfaces that read FROM views.dispatch_load_with_driver_status (not
 * mdata.loads directly — that view carries derived columns, e.g. latest_eta_prediction, that
 * views.live_loads does not project) and need to gate on views.live_loads's open_dispatch bucket
 * WITHOUT losing those columns. Rather than re-deriving the money predicate inline per caller (the
 * per-caller-convention failure this round fixes), every such caller joins against the one real
 * view via this EXISTS fragment — the SAME guarantee, no duplicated logic to drift.
 *
 * `loadIdColumn` names the column carrying the load's id in the caller's own FROM clause (aliased
 * to match, mirrors canonical-active-load-set.ts's own convention).
 */
export function liveLoadsOpenDispatchExistsSql(loadIdColumn = "l.id"): string {
  // LEAD 443.206R — delegates to THE load service (its only reader of views.live_loads).
  return `(${loadServiceIdInSql(loadIdColumn, "open_dispatch")})`;
}

/** Pre-built default (loadIdColumn = "l.id") for the common case. */
export const LIVE_LOADS_OPEN_DISPATCH_EXISTS_SQL = liveLoadsOpenDispatchExistsSql();
