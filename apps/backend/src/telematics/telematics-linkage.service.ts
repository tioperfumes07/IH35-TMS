/**
 * Linkage law, REVERSE direction, for every CC-3 engine output: from a LOAD, and from a UNIT, back to
 * everything the telematics / Samsara engines recorded about it. Read-only, entity-scoped.
 *
 * LOAD  -> stops (E-03 unit_stop_events.load_id_at_time), driven-miles segments (E-05), arrivals (E-09,
 *          STOP_ARRIVAL_EVENTS_SQL), fence state transitions (E-08), border crossings (E-29), DVIRs (T-51),
 *          detention (E-09 link), fuel fills on the load, driver prompts in the load's chat (E-30),
 *          Samsara route push ledger (E-31).
 * UNIT  -> load and driver RIGHT NOW (shared loadAtTimeSql / driverAtTimeSql), latest position (E-01),
 *          odometer anchors (E-06), stops (E-03), fence crossings with odometer (E-04), engine faults (E-10),
 *          harsh events (E-12), DVIRs as tractor or as trailer (T-51), fuel fills.
 */
import { driverAtTimeSql, loadAtTimeSql } from "../maintenance/driver-attribution.js";
import { STOP_ARRIVAL_EVENTS_SQL } from "./stop-arrival-events.js";

/** Display labels so a screen never renders a uuid (verify-no-uuid-label-rendering). */
const LN = (col: string) => `(SELECT x.load_number FROM mdata.loads x WHERE x.id = ${col}) AS load_number`;
const UN = (col: string) => `(SELECT x.unit_number FROM mdata.units x WHERE x.id = ${col}) AS unit_number`;
const DL = (col: string) => `(SELECT NULLIF(trim(concat_ws(' ', x.first_name, x.last_name)), '') FROM mdata.drivers x WHERE x.id = ${col}) AS driver_label`;

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function loadTelematicsLinks(client: Db, oc: string, loadId: string) {
  const q = (sql: string) => client.query(sql, [oc, loadId]).then((r) => r.rows);
  const load = (await q(`SELECT id::text, load_number, status::text, assigned_unit_id::text AS unit_id, assigned_primary_driver_id::text AS driver_id,
                                ${UN("assigned_unit_id")}, ${DL("assigned_primary_driver_id")}
                           FROM mdata.loads WHERE operating_company_id = $1::uuid AND id = $2::uuid`))[0];
  if (!load) return null;
  return {
    load,
    stops: await q(`SELECT e.id::text, e.unit_id::text, e.started_at, e.ended_at, e.dwell_minutes, e.city, e.state, e.odometer_mi,
                           e.miles_since_previous_stop, e.geofence_label, e.driver_id_at_time::text AS driver_id, ${UN("e.unit_id")}, ${DL("e.driver_id_at_time")}
                      FROM telematics.unit_stop_events e WHERE e.operating_company_id = $1::uuid AND e.load_id_at_time = $2::uuid ORDER BY e.started_at`),
    driven_miles_segments: await q(`SELECT s.id::text, s.segment_kind, s.started_at, s.ended_at, s.odometer_start_mi, s.odometer_end_mi, s.driven_miles
                                      FROM telematics.load_odometer_segments s WHERE s.operating_company_id = $1::uuid AND s.load_id = $2::uuid ORDER BY s.started_at`),
    arrivals: await q(`SELECT sa.stop_id::text, sa.unit_id::text, sa.driver_id::text, sa.triggered_at, sa.departed_at, sa.confirmed_at, ${UN("sa.unit_id")}, ${DL("sa.driver_id")}
                         FROM (${STOP_ARRIVAL_EVENTS_SQL}) sa WHERE sa.operating_company_id = $1::uuid AND sa.load_id = $2::uuid ORDER BY sa.triggered_at`),
    fence_transitions: await q(`SELECT t.id::text, g.label, g.location_kind, t.from_state, t.to_state, t.transitioned_at, t.stop_id::text
                                  FROM geo.geofence_state_transitions t JOIN geo.geofences g ON g.id = t.geofence_id
                                 WHERE t.operating_company_id = $1::uuid AND t.load_id = $2::uuid ORDER BY t.transitioned_at`),
    border_crossings: await q(`SELECT b.uuid::text AS id, b.crossing_point, b.direction, b.entered_geofence_at, b.exited_geofence_at, b.driver_uuid::text AS driver_id, ${DL("b.driver_uuid")}
                                 FROM dispatch.border_crossing_events b WHERE b.operating_company_id = $1::uuid AND b.load_uuid = $2::uuid ORDER BY b.entered_geofence_at`),
    dvirs: await q(`SELECT d.id::text, d.type, d.submitted_at, d.has_major_defect, d.has_any_defect, d.unit_id::text, d.driver_id::text, ${UN("d.unit_id")}, ${DL("d.driver_id")}
                      FROM safety.dvir_submissions d WHERE d.operating_company_id = $1::uuid AND d.load_id = $2::uuid ORDER BY d.submitted_at`),
    detention: await q(`SELECT de.id::text, de.stop_id::text, de.status, de.started_at, de.stopped_at, de.geofence_event_id::text
                          FROM dispatch.detention_events de WHERE de.operating_company_id = $1::uuid AND de.load_id = $2::uuid ORDER BY de.started_at`),
    fuel_fills: await q(`SELECT f.id::text, f.transaction_at, f.fuel_type, f.gallons, f.total_cost, f.location_city, f.location_state, f.unit_id::text, ${UN("f.unit_id")}
                           FROM fuel.fuel_transactions f WHERE f.operating_company_id = $1::uuid AND f.load_id = $2::uuid AND f.voided_at IS NULL ORDER BY f.transaction_at`),
    driver_prompts: await q(`SELECT m.id::text, m.msg_type, m.body, m.server_ts
                               FROM chat.messages m JOIN chat.threads t ON t.id = m.thread_id
                              WHERE t.operating_company_id = $1::uuid AND t.load_id = $2 AND m.client_key LIKE 'prompt:%' ORDER BY m.server_ts`),
    samsara_route_pushes: await q(`SELECT started_at, success, payload->>'outcome' AS outcome, payload->>'samsara_route_id' AS samsara_route_id
                                     FROM integrations.integration_sync_log
                                    WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = 'route_push'
                                      AND payload->>'load_id' = $2::text ORDER BY started_at`),
  };
}

export async function unitTelematicsLinks(client: Db, oc: string, unitId: string, windowDays = 30) {
  const args = [oc, unitId, windowDays];
  const q = (sql: string) => client.query(sql, args).then((r) => r.rows);
  const unit = (await q(`SELECT u.id::text, u.unit_number, u.samsara_vehicle_id,
                                load_at_time.load_id::text AS load_now, driver_at_time.driver_id::text AS driver_now,
                                (SELECT x.load_number FROM mdata.loads x WHERE x.id = load_at_time.load_id) AS load_now_number,
                                (SELECT NULLIF(trim(concat_ws(' ', x.first_name, x.last_name)), '') FROM mdata.drivers x WHERE x.id = driver_at_time.driver_id) AS driver_now_label
                           FROM mdata.units u
                           ${loadAtTimeSql("u.id", "now()")}
                           ${driverAtTimeSql("u.id", "now()")}
                          WHERE u.id = $2::uuid AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
                            AND $3::int > 0`))[0];
  if (!unit) return null;
  const since = `now() - make_interval(days => $3::int)`;
  return {
    unit,
    latest_position: (await q(`SELECT captured_at, lat, lng, speed_mph, odometer_mi, city, state FROM telematics.vehicle_locations
                                WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid AND $3::int > 0 ORDER BY captured_at DESC LIMIT 1`))[0] ?? null,
    odometer_anchors: await q(`SELECT read_at, odometer_miles, source FROM telematics.odometer_readings
                                WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid AND read_at >= ${since} ORDER BY read_at DESC`),
    stops: await q(`SELECT e.id::text, e.started_at, e.dwell_minutes, e.city, e.state, e.odometer_mi, e.miles_since_previous_stop, e.load_id_at_time::text AS load_id, e.driver_id_at_time::text AS driver_id, ${LN("e.load_id_at_time")}, ${DL("e.driver_id_at_time")}
                      FROM telematics.unit_stop_events e WHERE e.operating_company_id = $1::uuid AND e.unit_id = $2::uuid AND e.started_at >= ${since} ORDER BY e.started_at DESC`),
    fence_crossings: await q(`SELECT c.id::text, g.label, c.geofence_kind, c.event_kind, c.occurred_at, c.odometer_mi, c.odometer_source
                                FROM telematics.geofence_odometer_captures c JOIN geo.geofences g ON g.id = c.geofence_id
                               WHERE c.operating_company_id = $1::uuid AND c.unit_id = $2::uuid AND c.occurred_at >= ${since} ORDER BY c.occurred_at DESC`),
    engine_faults: await q(`SELECT h.id::text, h.fault_code, h.severity, h.occurred_at, h.resolved_at, h.auto_wo_id::text
                              FROM maintenance.samsara_fault_code_history h WHERE h.operating_company_id = $1::uuid AND h.unit_id = $2::uuid AND h.occurred_at >= ${since} ORDER BY h.occurred_at DESC`),
    harsh_events: await q(`SELECT e.id::text, e.event_kind, e.event_at, e.g_force, e.driver_id::text, ${DL("e.driver_id")}
                             FROM safety.harsh_events e WHERE e.operating_company_id = $1::uuid AND e.unit_id = $2::uuid AND e.event_at >= ${since} ORDER BY e.event_at DESC`),
    dvirs: await q(`SELECT d.id::text, d.type, d.submitted_at, d.has_major_defect, d.load_id::text, d.driver_id::text, ${LN("d.load_id")}, ${DL("d.driver_id")},
                           CASE WHEN d.unit_id = $2::uuid THEN 'tractor' ELSE 'trailer' END AS role
                      FROM safety.dvir_submissions d
                     WHERE d.operating_company_id = $1::uuid AND (d.unit_id = $2::uuid OR d.trailer_id = $2::uuid) AND d.submitted_at >= ${since}
                     ORDER BY d.submitted_at DESC`),
    fuel_fills: await q(`SELECT f.id::text, f.transaction_at, f.fuel_type, f.gallons, f.total_cost, f.load_id::text, ${LN("f.load_id")}
                           FROM fuel.fuel_transactions f WHERE f.operating_company_id = $1::uuid AND f.unit_id = $2::uuid AND f.voided_at IS NULL
                            AND f.transaction_at >= ${since} ORDER BY f.transaction_at DESC`),
  };
}
