/**
 * Canonical active-load universe for dispatch ETA alerts.
 *
 * At-risk and late-arrival are overlapping alert signals, not separate load
 * lifecycles. Keeping the status predicate here prevents the two queues from
 * silently disagreeing as load statuses evolve.
 */
export const DISPATCH_ALERT_ACTIVE_STATUSES = [
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;

export const DISPATCH_ALERT_ACTIVE_STATUSES_SQL = DISPATCH_ALERT_ACTIVE_STATUSES
  .map((status) => `'${status}'`)
  .join(", ");
