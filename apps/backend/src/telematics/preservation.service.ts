/**
 * CC-3 queue item 11 — the telematics + geocode PRESERVATION engine. Copies every observed fact into the append-only
 * `preserve` schema (migration 202615220900), keyed by natural keys only (unit number, load number, driver name + CDL,
 * UTC timestamp, coordinates, the address as geocoded). Old UUIDs ride along in pre_reset as dead reference.
 * Idempotent: INSERT ... SELECT ... ON CONFLICT DO NOTHING per table, so a re-run copies only what is new.
 * `sinceDays` bounds a routine run by source created_at; null copies everything (the one-time backfill).
 */

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

const UNIT = (alias: string, idCol: string) =>
  `coalesce((SELECT u.unit_number FROM mdata.units u WHERE u.id = ${alias}.${idCol}), 'UNKNOWN-' || coalesce(${alias}.${idCol}::text, 'none'))`;
const LOAD = (alias: string, idCol: string) => `(SELECT l.load_number::text FROM mdata.loads l WHERE l.id = ${alias}.${idCol})`;
const DRIVER_NAME = (alias: string, idCol: string) =>
  `(SELECT nullif(btrim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), '') FROM mdata.drivers d WHERE d.id = ${alias}.${idCol})`;
const DRIVER_CDL = (alias: string, idCol: string) =>
  `(SELECT nullif(btrim(coalesce(d.cdl_state, '') || ' ' || coalesce(d.cdl_number::text, '')), '') FROM mdata.drivers d WHERE d.id = ${alias}.${idCol})`;
const COMPANY = (alias: string) => `(SELECT c.code FROM org.companies c WHERE c.id = ${alias}.operating_company_id)`;
/**
 * The fence's natural key: its Samsara address id when it has one, else label + centre to 5 decimals (~1 m) — plus its
 * radius and a short hash of its vertices, because the same place was drawn more than once with different shapes
 * (12 of 36 same-place pairs on prod differ) and each definition is a fact of its own.
 */
export const FENCE_KEY = (g: string) =>
  `coalesce('samsara:' || ${g}.samsara_address_id, 'fence:' || coalesce(${g}.label, '') || '@' || coalesce(round(${g}.center_lat, 5)::text, '?') || ',' || coalesce(round(${g}.center_lng, 5)::text, '?'))
   || '#r' || coalesce(${g}.radius_m::text, '?') || '#' || left(md5(coalesce(${g}.vertices_json::text, '')), 8)`;
const WINDOW = (col: string, sinceDays: number | null) => (sinceDays == null ? "true" : `${col} >= now() - interval '${Math.max(1, Math.floor(sinceDays))} days'`);

export const PRESERVE_STEPS = (sinceDays: number | null): Array<{ table: string; sql: string }> => [
  { table: "geofences", sql: `
    INSERT INTO preserve.geofences (company_code, fence_key, label, location_kind, center_lat, center_lng, radius_m, vertices_json,
                                    samsara_address_id, formatted_address, source, first_seen_at, pre_reset)
    SELECT ${COMPANY("g")}, ${FENCE_KEY("g")}, g.label, g.location_kind, g.center_lat, g.center_lng, g.radius_m, g.vertices_json,
           g.samsara_address_id, (SELECT a.formatted_address FROM integrations.samsara_addresses a WHERE a.samsara_address_id = g.samsara_address_id LIMIT 1),
           g.source, g.created_at, jsonb_build_object('pre_reset', true, 'geofence_id', g.id, 'location_ref_id', g.location_ref_id)
      FROM geo.geofences g WHERE ${WINDOW("g.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "samsara_addresses", sql: `
    INSERT INTO preserve.samsara_addresses (company_code, samsara_address_id, name, formatted_address, lat, lng, geofence_json, tags, notes, synced_at, pre_reset)
    SELECT ${COMPANY("a")}, a.samsara_address_id, a.name, a.formatted_address, a.lat, a.lng, a.geofence_json, a.tags, a.notes, a.synced_at,
           jsonb_build_object('pre_reset', true, 'id', a.id)
      FROM integrations.samsara_addresses a WHERE ${WINDOW("a.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "vehicle_positions", sql: `
    INSERT INTO preserve.vehicle_positions (company_code, unit_number, captured_at, lat, lng, speed_mph, heading_deg, engine_state, odometer_mi,
                                            city, state, formatted_location, samsara_vehicle_id, observation_id, pre_reset)
    SELECT ${COMPANY("p")}, ${UNIT("p", "unit_id")}, p.captured_at, p.lat, p.lng, p.speed_mph, p.heading_deg, p.engine_state, p.odometer_mi,
           p.city, p.state, p.formatted_location, p.samsara_vehicle_id,
           coalesce(p.source_raw_samsara_event_id, p.raw_samsara_event_id, 'none:' || p.captured_at::text),
           jsonb_build_object('pre_reset', true, 'id', p.id, 'unit_id', p.unit_id, 'raw_samsara_event_id', p.raw_samsara_event_id)
      FROM telematics.vehicle_locations p WHERE ${WINDOW("p.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "geofence_events", sql: `
    INSERT INTO preserve.geofence_events (company_code, unit_number, fence_key, event_kind, occurred_at, point_lat, point_lng, fence_label,
                                          driver_name, driver_cdl, odometer_mi, odometer_source, source, pre_reset)
    SELECT ${COMPANY("e")}, ${UNIT("e", "unit_id")}, ${FENCE_KEY("g")}, e.event_kind, e.occurred_at, e.point_lat, e.point_lng, g.label,
           ${DRIVER_NAME("e", "driver_id")}, ${DRIVER_CDL("e", "driver_id")}, oc.odometer_mi, oc.odometer_source, e.source,
           jsonb_build_object('pre_reset', true, 'id', e.id, 'geofence_id', e.geofence_id, 'unit_id', e.unit_id, 'driver_id', e.driver_id)
      FROM geo.geofence_events e JOIN geo.geofences g ON g.id = e.geofence_id
      LEFT JOIN telematics.geofence_odometer_captures oc ON oc.geofence_event_id = e.id
     WHERE ${WINDOW("e.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "unit_stop_events", sql: `
    INSERT INTO preserve.unit_stop_events (company_code, unit_number, started_at, ended_at, dwell_minutes, lat, lng, city, state, odometer_mi,
                                           odometer_read_at, miles_since_previous_stop, fence_label, fence_kind, driver_name, driver_cdl, load_number, pre_reset)
    SELECT ${COMPANY("s")}, ${UNIT("s", "unit_id")}, s.started_at, s.ended_at, s.dwell_minutes, s.lat, s.lng, s.city, s.state, s.odometer_mi,
           s.odometer_read_at, s.miles_since_previous_stop, s.geofence_label, s.geofence_kind,
           ${DRIVER_NAME("s", "driver_id_at_time")}, ${DRIVER_CDL("s", "driver_id_at_time")}, ${LOAD("s", "load_id_at_time")},
           jsonb_build_object('pre_reset', true, 'id', s.id, 'unit_id', s.unit_id, 'driver_id', s.driver_id_at_time, 'load_id', s.load_id_at_time, 'geofence_id', s.geofence_id)
      FROM telematics.unit_stop_events s WHERE ${WINDOW("s.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "odometer_readings", sql: `
    INSERT INTO preserve.odometer_readings (company_code, unit_number, read_at, source, odometer_mi, confidence, pre_reset)
    SELECT ${COMPANY("o")}, ${UNIT("o", "unit_id")}, o.read_at, o.source, o.odometer_miles, o.confidence,
           jsonb_build_object('pre_reset', true, 'id', o.id, 'unit_id', o.unit_id)
      FROM telematics.odometer_readings o WHERE ${WINDOW("o.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "load_odometer_segments", sql: `
    INSERT INTO preserve.load_odometer_segments (company_code, load_number, unit_number, segment_kind, started_at, ended_at, odometer_start_mi,
                                                 odometer_end_mi, driven_miles, pre_reset)
    SELECT ${COMPANY("x")}, coalesce(${LOAD("x", "load_id")}, 'UNKNOWN-' || x.load_id::text), ${UNIT("x", "unit_id")}, x.segment_kind,
           x.started_at, x.ended_at, x.odometer_start_mi, x.odometer_end_mi, x.driven_miles,
           jsonb_build_object('pre_reset', true, 'id', x.id, 'load_id', x.load_id, 'unit_id', x.unit_id, 'from_stop_id', x.from_stop_id, 'to_stop_id', x.to_stop_id)
      FROM telematics.load_odometer_segments x WHERE x.started_at IS NOT NULL AND ${WINDOW("x.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "route_stop_progress", sql: `
    INSERT INTO preserve.route_stop_progress (company_code, load_number, sequence_number, unit_number, samsara_route_id, samsara_stop_id, state, eta,
                                              actual_arrival_at, actual_departure_at, stop_city, stop_state, read_at, pre_reset)
    SELECT ${COMPANY("r")}, coalesce(${LOAD("r", "load_id")}, 'UNKNOWN-' || r.load_id::text), r.sequence_number, ${UNIT("r", "unit_id")},
           r.samsara_route_id, r.samsara_stop_id, r.state, r.eta, r.actual_arrival_at, r.actual_departure_at,
           (SELECT st.city FROM mdata.load_stops st WHERE st.id = r.stop_id), (SELECT st.state FROM mdata.load_stops st WHERE st.id = r.stop_id), r.read_at,
           jsonb_build_object('pre_reset', true, 'load_id', r.load_id, 'stop_id', r.stop_id, 'unit_id', r.unit_id)
      FROM integrations.samsara_route_stop_progress r WHERE ${WINDOW("r.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "dvir_submissions", sql: `
    INSERT INTO preserve.dvir_submissions (company_code, unit_number, submitted_at, dvir_type, trailer_number, driver_name, driver_cdl, load_number,
                                           odometer, location, geo_lat, geo_lng, items, has_major_defect, has_any_defect, certified, pre_reset)
    SELECT ${COMPANY("v")}, ${UNIT("v", "unit_id")}, v.submitted_at, coalesce(v.type, 'unknown'),
           coalesce((SELECT e.equipment_number FROM mdata.equipment e WHERE e.id = v.trailer_equipment_id), (SELECT u.unit_number FROM mdata.units u WHERE u.id = v.trailer_id)),
           ${DRIVER_NAME("v", "driver_id")}, ${DRIVER_CDL("v", "driver_id")}, ${LOAD("v", "load_id")}, v.odometer, v.location, v.geo_lat, v.geo_lng, v.items,
           v.has_major_defect, v.has_any_defect, v.certified,
           jsonb_build_object('pre_reset', true, 'id', v.id, 'unit_id', v.unit_id, 'driver_id', v.driver_id, 'load_id', v.load_id, 'follow_up_wo_id', v.follow_up_wo_id)
      FROM safety.dvir_submissions v WHERE v.submitted_at IS NOT NULL AND ${WINDOW("v.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
  { table: "hos_snapshots", sql: `
    INSERT INTO preserve.hos_snapshots (company_code, driver_key, polled_at, driver_name, driver_cdl, unit_number, duty_status, driving_hours_remaining,
                                        on_duty_hours_remaining, cycle_hours_remaining, time_to_next_break_minutes, samsara_event_at, payload_hash, pre_reset)
    SELECT ${COMPANY("h")},
           coalesce(${DRIVER_NAME("h", "driver_uuid")} || ' | ' || coalesce(${DRIVER_CDL("h", "driver_uuid")}, 'no CDL'), 'UNKNOWN-' || coalesce(h.driver_uuid::text, 'none')),
           h.polled_at, ${DRIVER_NAME("h", "driver_uuid")}, ${DRIVER_CDL("h", "driver_uuid")}, (SELECT u.unit_number FROM mdata.units u WHERE u.id = h.vehicle_uuid),
           h.duty_status, h.driving_hours_remaining, h.on_duty_hours_remaining, h.cycle_hours_remaining, h.time_to_next_break_minutes, h.samsara_event_at,
           md5(coalesce(h.samsara_payload::text, '') || '|' || coalesce(h.duty_status, '') || '|' || coalesce(h.vehicle_uuid::text, '')),
           jsonb_build_object('pre_reset', true, 'id', h.id, 'driver_uuid', h.driver_uuid, 'vehicle_uuid', h.vehicle_uuid)
      FROM samsara.hos_snapshots h WHERE h.polled_at IS NOT NULL AND ${WINDOW("h.created_at", sinceDays)}
    ON CONFLICT DO NOTHING` },
];

/** Run every step; returns rows newly preserved per table. Caller supplies a bypass-scoped client (cron / ops). */
export async function preserveTelematics(client: Q, opts: { sinceDays: number | null }) {
  const out: Record<string, number> = {};
  for (const step of PRESERVE_STEPS(opts.sinceDays)) {
    const r = await client.query(step.sql);
    out[step.table] = r.rowCount ?? 0;
  }
  return out;
}
