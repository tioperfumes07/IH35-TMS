/**
 * E-09 — the ONE arrival source after dispatch.stop_arrivals is retired (Lead decision 2026-10-01).
 *
 * An arrival = the first 'entered' row in geo.geofence_events (written only by the canonical detector,
 * processGeofenceDetectionsForGpsPoint) on a load-stop fence labelled `load-<load uuid>-stop-<sequence>`
 * (minted by E-25 / bindLoadToGeofences), mapped to that mdata.load_stops row. Departure = the next
 * 'exited' on the same fence by the same unit.
 *
 * Column shape matches the retired table so each reader swaps its FROM clause only:
 *   id (= the geofence event id), operating_company_id, stop_id, load_id, unit_id, driver_id,
 *   triggered_at, confirmed_at, confirmed_by_driver_uuid, distance_at_trigger_ft (always NULL — the fence
 *   decides, not a distance), departed_at.
 * A driver's confirmation is an append-only audit event 'dispatch.stop_arrival_confirmed' whose
 * payload.resource_id is the geofence event id (fence events are immutable) — the same pattern the
 * prompt already uses for 'dispatch.stop_arrival_dismissed'.
 *
 * Use as a derived table:  FROM (${STOP_ARRIVAL_EVENTS_SQL}) sa
 */
export const STOP_ARRIVAL_EVENTS_SQL = `
  SELECT DISTINCT ON (ls.id, ge.unit_id)
         ge.id,
         ge.operating_company_id,
         ls.id AS stop_id,
         ls.load_id,
         ge.unit_id,
         ge.driver_id,
         ge.occurred_at AS triggered_at,
         conf.confirmed_at,
         conf.confirmed_by_driver_uuid,
         NULL::numeric AS distance_at_trigger_ft,
         (SELECT min(x.occurred_at) FROM geo.geofence_events x
           WHERE x.geofence_id = ge.geofence_id AND x.unit_id = ge.unit_id
             AND x.event_kind = 'exited' AND x.occurred_at > ge.occurred_at) AS departed_at
    FROM geo.geofence_events ge
    JOIN geo.geofences g ON g.id = ge.geofence_id
     AND g.label ~ '^load-[0-9a-f-]{36}-stop-[0-9]+$'
    JOIN mdata.load_stops ls
      ON ls.load_id = substring(g.label FROM '^load-([0-9a-f-]{36})-stop-')::uuid
     AND ls.sequence_number = substring(g.label FROM '-stop-([0-9]+)$')::int
     AND ls.soft_deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT (ae.payload->>'confirmed_at')::timestamptz AS confirmed_at,
             (ae.payload->>'confirmed_by_driver_uuid')::uuid AS confirmed_by_driver_uuid
        FROM audit.audit_events ae
       WHERE ae.event_class = 'dispatch.stop_arrival_confirmed'
         AND ae.payload->>'resource_id' = ge.id::text
       ORDER BY ae.created_at DESC
       LIMIT 1
    ) conf ON true
   WHERE ge.event_kind = 'entered'
   ORDER BY ls.id, ge.unit_id, ge.occurred_at
`;
