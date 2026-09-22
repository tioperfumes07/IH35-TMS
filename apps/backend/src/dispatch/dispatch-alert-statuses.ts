/**
 * Active-load universe for dispatch ETA alerts.
 *
 * At-risk and late-arrival are overlapping alert signals, not separate load
 * lifecycles. Keeping the status predicate here prevents the two queues from
 * silently disagreeing as load statuses evolve.
 *
 * ROUND 31.2 (2026-09-23): a narrower view of the real canonical active-load set
 * (apps/backend/src/dispatch/canonical-active-load-set.ts) — an alert queue asks "is this load
 * moving right now," narrower than "is this load active." `assertCanonicalSubset` throws at
 * import time if this ever drifts outside the canonical set.
 */
import { assertCanonicalSubset } from "./canonical-active-load-set.js";

export const DISPATCH_ALERT_ACTIVE_STATUSES = [
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;
assertCanonicalSubset("DISPATCH_ALERT_ACTIVE_STATUSES", DISPATCH_ALERT_ACTIVE_STATUSES);

export const DISPATCH_ALERT_ACTIVE_STATUSES_SQL = DISPATCH_ALERT_ACTIVE_STATUSES
  .map((status) => `'${status}'`)
  .join(", ");
