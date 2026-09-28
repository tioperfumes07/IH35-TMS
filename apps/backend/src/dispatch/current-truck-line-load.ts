/**
 * CURRENT load predicate for Truck Line / Kanban / List / Round Trips / Trip Pairing /
 * Load Costs (ROUND 155.6 + ruling 155.3a).
 *
 * ONE named helper. Every dispatch board that asks "is this load CURRENT work right now"
 * imports from this file — never forks the SQL. CC-3's four views (Kanban/List/Round Trips/
 * Trip Pairing) import it under ruling 155.3a.
 *
 * Semantics (owner-backed #22922): open_dispatch in the four active statuses, BUT hide
 * AUTH-061-class shells that are still `dispatched` with zero stop stamps and a delivery
 * appointment already older than 48h. Those are not live work.
 *
 * Alias: the load row is expected as `x` (views.live_loads). Use `currentTruckLineLoadSql`
 * when the alias differs.
 */

/** CURRENT-load SQL for a named live_loads alias. */
export function currentTruckLineLoadSql(alias = "x"): string {
  return `
  ${alias}.live_state = 'open_dispatch'
  AND ${alias}.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
  AND (
    ${alias}.status <> 'dispatched'
    OR EXISTS (
      SELECT 1 FROM mdata.load_stops s
      WHERE s.load_id = ${alias}.id AND s.soft_deleted_at IS NULL
        AND (s.actual_arrival_at IS NOT NULL OR s.actual_departure_at IS NOT NULL)
    )
    OR EXISTS (
      SELECT 1 FROM mdata.load_stops s
      WHERE s.load_id = ${alias}.id AND s.soft_deleted_at IS NULL
        AND s.stop_type = 'delivery'::mdata.stop_type_enum
        AND COALESCE(s.appointment_start_at, s.scheduled_arrival_at) >= now() - interval '48 hours'
    )
  )
`;
}

/** Default fragment — alias `x` (views.live_loads). */
export const CURRENT_TRUCK_LINE_LOAD_SQL = currentTruckLineLoadSql("x");
