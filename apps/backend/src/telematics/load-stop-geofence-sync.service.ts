/**
 * E-25 (Lead, 2026-10-01) — load-stop geofence sync + retro arrival stamping.
 *
 * ONE engine, three passes, each reusing the existing writer (never a second copy of its rules):
 *   1. syncLoadStopGeofences      every board-active load gets its stop fences bound/refreshed
 *                                 through bindLoadToGeofences (the only fence minter).
 *   2. replayUnitHistoryForFences for fences created THIS pass, replay the assigned unit's own
 *                                 stored GPS fixes (back-dated loads: the pickup already happened
 *                                 before the load existed) through processGeofenceDetectionsForGpsPoint
 *                                 with suppressOperationalSideEffects — it writes immutable
 *                                 geo.geofence_events only, exactly like the boot-time replay.
 *   3. stampStopsFromGeofenceEvents a stop with NULL actual_arrival_at whose fence has an
 *                                 'entered' event by the assigned unit followed by >= 5 min of
 *                                 dwell gets actual_arrival_at / actual_departure_at from those
 *                                 events, source 'eld_geofence' (honest: ELD/GPS-derived).
 *                                 Compare-and-set on NULL only; never overwrites driver/manual.
 *                                 Deliberately does NOT mint the first-pickup proforma (that is
 *                                 the live D-1 path's job for live events; a backfilled stamp is
 *                                 evidence of the past, not a money event happening now).
 *
 * MEASURED ROOT CAUSE (live USMCA, 2026-10-01): 0 load-stop fences ever, any company; 16
 * dispatched loads / 33 geocoded stops / 1 stamped. See load-stop-geofence-geometry.ts.
 */
import { bindLoadToGeofences } from "../dispatch/geofences/load-geofence-binding.service.js";
import { canonicalDispatchWorkStatusClause } from "../dispatch/canonical-active-load-set.js";
import { processGeofenceDetectionsForGpsPoint } from "./geofence-detector.service.js";
import { normalizeVertices, pointInPolygon } from "./geofence.js";
import { geocodeStopsWithClient } from "./stops-geocode-backfill.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const RETRO_DWELL_MINUTES = 5;
export const RETRO_REPLAY_LOOKBACK_DAYS = 10;

export type LoadStopGeofenceSyncResult = {
  retro_stamp_enabled: boolean;
  fences_retired: number;
  loads_scanned: number;
  fences_created: number;
  fences_refreshed: number;
  fences_unchanged: number;
  stops_skipped_low_precision: number;
  replay_positions_checked: number;
  replay_events_written: number;
  stops_stamped_arrival: number;
  stops_stamped_departure: number;
  geocode_resweep_loads: number;
  geocode_resweep_stops_geocoded: number;
  geocode_resweep_failures: number;
};

type ActiveLoadRow = { load_id: string; unit_id: string | null; created_at: string; earliest_scheduled: string | null };

export async function syncLoadStopGeofences(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ loads: ActiveLoadRow[]; newFenceIds: string[]; created: number; refreshed: number; unchanged: number; skipped: number }> {
  const loads = await client.query<ActiveLoadRow>(
    `
      SELECT l.id::text AS load_id,
             l.assigned_unit_id::text AS unit_id,
             l.created_at::text AS created_at,
             (SELECT min(s.scheduled_arrival_at)::text FROM mdata.load_stops s
               WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL) AS earliest_scheduled
        FROM mdata.loads l
       WHERE l.operating_company_id = $1::uuid
         AND l.soft_deleted_at IS NULL
         AND COALESCE(l.is_sample_data, false) = false
         AND ${canonicalDispatchWorkStatusClause("l")}
       ORDER BY l.created_at
    `,
    [operatingCompanyId]
  );
  const newFenceIds: string[] = [];
  let created = 0, refreshed = 0, unchanged = 0, skipped = 0;
  for (const load of loads.rows) {
    const before = await client.query<{ id: string }>(
      `SELECT id::text FROM geo.geofences WHERE operating_company_id = $1::uuid AND is_active = true AND label LIKE $2`,
      [operatingCompanyId, `load-${load.load_id}-stop-%`]
    );
    const known = new Set(before.rows.map((r) => r.id));
    const r = await bindLoadToGeofences(client, operatingCompanyId, load.load_id);
    created += r.created; refreshed += r.refreshed; unchanged += r.unchanged; skipped += r.skipped_low_precision.length;
    for (const id of r.geofence_ids) if (!known.has(id)) newFenceIds.push(id);
    // A refreshed fence (stop re-geocoded) must also be replayed: its old events were against the wrong pin.
    if (r.refreshed > 0) for (const id of r.geofence_ids) if (known.has(id)) newFenceIds.push(id);
  }
  return { loads: loads.rows, newFenceIds, created, refreshed, unchanged, skipped };
}

/**
 * A fence whose load left dispatch work (delivered or later, soft-deleted, cancelled) is retired, so the
 * per-point containment scan and the customer-site breach alerts only ever see live stops.
 * Events already written stay (immutable); only is_active flips.
 */
export async function retireLoadStopGeofencesForInactiveLoads(client: DbClient, operatingCompanyId: string): Promise<number> {
  const r = await client.query(
    `
      UPDATE geo.geofences g
         SET is_active = false, updated_at = now()
       WHERE g.operating_company_id = $1::uuid
         AND g.is_active = true
         AND g.source = 'auto_dispatch'
         AND g.label LIKE 'load-%-stop-%'
         AND NOT EXISTS (
           SELECT 1 FROM mdata.loads l
            WHERE l.operating_company_id = $1::uuid
              AND l.id::text = substring(g.label from 'load-(.*)-stop-')
              AND l.soft_deleted_at IS NULL
              AND ${canonicalDispatchWorkStatusClause("l")}
         )
    `,
    [operatingCompanyId]
  );
  return r.rowCount ?? 0;
}

/**
 * Replay the assigned unit's stored fixes against the NEW fences only. Boundary-candidate filter
 * mirrors geofence-events-backfill.service.ts; the canonical writer re-checks every candidate
 * against ALL active fences, so this never writes an event the live path would not have.
 */
export async function replayUnitHistoryForFences(
  client: DbClient,
  operatingCompanyId: string,
  loads: ActiveLoadRow[],
  newFenceIds: string[]
): Promise<{ positions_checked: number; events_written: number }> {
  if (newFenceIds.length === 0) return { positions_checked: 0, events_written: 0 };
  const fences = await client.query<{ id: string; load_id: string; vertices_json: unknown }>(
    `SELECT id::text, substring(label from 'load-(.*)-stop-') AS load_id, vertices_json
       FROM geo.geofences WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`,
    [operatingCompanyId, newFenceIds]
  );
  const fencesByLoad = new Map<string, Array<{ id: string; vertices: ReturnType<typeof normalizeVertices> }>>();
  for (const f of fences.rows) {
    const list = fencesByLoad.get(f.load_id) ?? [];
    list.push({ id: f.id, vertices: normalizeVertices(f.vertices_json) });
    fencesByLoad.set(f.load_id, list);
  }
  let positionsChecked = 0;
  let eventsWritten = 0;
  for (const load of loads) {
    const loadFences = fencesByLoad.get(load.load_id);
    if (!loadFences || !load.unit_id) continue;
    const sinceCandidates = [new Date(load.created_at).getTime() - 24 * 3600_000];
    if (load.earliest_scheduled) sinceCandidates.push(new Date(load.earliest_scheduled).getTime() - 24 * 3600_000);
    const floor = Date.now() - RETRO_REPLAY_LOOKBACK_DAYS * 86_400_000;
    const since = new Date(Math.max(floor, Math.min(...sinceCandidates))).toISOString();
    const positions = await client.query<{ lat: number; lng: number; captured_at: string }>(
      `SELECT lat::double precision AS lat, lng::double precision AS lng, captured_at::text
         FROM telematics.vehicle_locations
        WHERE unit_id = $1::uuid AND captured_at >= $2::timestamptz
        ORDER BY captured_at ASC, id ASC`,
      [load.unit_id, since]
    );
    const containment = new Map<string, boolean>();
    for (const p of positions.rows) {
      positionsChecked += 1;
      let changed = false;
      for (const f of loadFences) {
        const inside = pointInPolygon(p.lat, p.lng, f.vertices);
        const prev = containment.get(f.id);
        if (prev !== inside) {
          containment.set(f.id, inside);
          changed = changed || inside || prev === true;
        }
      }
      if (!changed) continue;
      const r = await processGeofenceDetectionsForGpsPoint(
        client,
        { operating_company_id: operatingCompanyId, unit_id: load.unit_id, latitude: p.lat, longitude: p.lng, occurred_at: p.captured_at, source: "samsara_gps" },
        { suppressOperationalSideEffects: true }
      );
      eventsWritten += r.transitions_written;
    }
  }
  return { positions_checked: positionsChecked, events_written: eventsWritten };
}

export async function stampStopsFromGeofenceEvents(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ arrivals: number; departures: number }> {
  // Candidate = (stop with NULL arrival, its bound fence, the load's assigned unit, the FIRST
  // 'entered' event by that unit whose dwell >= RETRO_DWELL_MINUTES). Dwell = next 'exited' by
  // the same unit on the same fence, or (no exit yet) the unit's latest fix still inside.
  const arrivals = await client.query<{ stop_id: string; load_id: string; load_number: string; stop_type: string; entered_at: string; exited_at: string | null; fence_id: string }>(
    `
      WITH cand AS (
        SELECT ls.id AS stop_id, l.id AS load_id, l.load_number, ls.stop_type, g.id AS fence_id, l.assigned_unit_id AS unit_id
          FROM mdata.load_stops ls
          JOIN mdata.loads l ON l.id = ls.load_id
          JOIN geo.geofences g ON g.operating_company_id = l.operating_company_id
                              AND g.is_active = true
                              AND g.label = 'load-' || l.id::text || '-stop-' || ls.sequence_number::text
         WHERE l.operating_company_id = $1::uuid
           AND l.soft_deleted_at IS NULL AND ls.soft_deleted_at IS NULL
           AND COALESCE(l.is_sample_data, false) = false
           AND l.assigned_unit_id IS NOT NULL
           AND ls.actual_arrival_at IS NULL
      ), ev AS (
        SELECT c.*, e.occurred_at AS entered_at,
               (SELECT min(x.occurred_at) FROM geo.geofence_events x
                 WHERE x.geofence_id = c.fence_id AND x.unit_id = c.unit_id AND x.event_kind = 'exited' AND x.occurred_at > e.occurred_at) AS exited_at,
               (SELECT max(v.captured_at) FROM telematics.vehicle_locations v WHERE v.unit_id = c.unit_id) AS last_fix_at
          FROM cand c
          JOIN geo.geofence_events e ON e.geofence_id = c.fence_id AND e.unit_id = c.unit_id AND e.event_kind = 'entered'
      )
      SELECT DISTINCT ON (stop_id) stop_id::text, load_id::text, load_number, stop_type, entered_at::text, exited_at::text, fence_id::text
        FROM ev
       WHERE COALESCE(exited_at, last_fix_at) - entered_at >= make_interval(mins => $2)
       ORDER BY stop_id, entered_at ASC
    `,
    [operatingCompanyId, RETRO_DWELL_MINUTES]
  );
  let stampedArrivals = 0;
  let stampedDepartures = 0;
  for (const a of arrivals.rows) {
    const upd = await client.query<{ id: string }>(
      `UPDATE mdata.load_stops
          SET actual_arrival_at = $2::timestamptz, actual_arrival_source = 'eld_geofence',
              actual_departure_at = COALESCE(actual_departure_at, $3::timestamptz),
              actual_departure_source = CASE WHEN actual_departure_at IS NULL AND $3::timestamptz IS NOT NULL THEN 'eld_geofence' ELSE actual_departure_source END,
              updated_at = now()
        WHERE id = $1::uuid AND actual_arrival_at IS NULL
        RETURNING id::text`,
      [a.stop_id, a.entered_at, a.exited_at]
    );
    if (upd.rows.length === 0) continue;
    stampedArrivals += 1;
    if (a.exited_at) stampedDepartures += 1;
    await client.query(
      `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
       VALUES (gen_random_uuid(), now(), 'dispatch.load_stop.stamped_from_geofence_events', 'info', $1::jsonb, NULL, 'E-25-load-stop-geofence-sync')`,
      [JSON.stringify({
        operating_company_id: operatingCompanyId, load_id: a.load_id, load_number: a.load_number, stop_id: a.stop_id,
        stop_type: a.stop_type, geofence_id: a.fence_id, actual_arrival_at: a.entered_at, actual_departure_at: a.exited_at,
        actual_arrival_source: "eld_geofence", dwell_minutes_required: RETRO_DWELL_MINUTES,
        money_side_effects: "none (proforma mint is the live D-1 path's job; a backfilled stamp is past evidence)",
      })]
    );
  }
  return { arrivals: stampedArrivals, departures: stampedDepartures };
}

/**
 * OWNER FREEZE (2026-10-01, verbatim): "NOBODY SHOULD BE ADDING OR CREATING ANYTHING YET". Fences
 * and geofence_events are this engine's own output; a stop's actual_arrival_at is a business
 * record. The retro stamp pass therefore ships flag-OFF and the Lead carries the switch to the
 * owner. The live forward path (geofence-detector D-1) is untouched.
 */
export function retroStampEnabled(): boolean {
  return (process.env.LOAD_STOP_RETRO_STAMP_ENABLED ?? "false").trim() === "true";
}

/**
 * Lead 2026-10-01 (measured on load 13593): the post-book geocode hook is fire-and-forget; when it
 * dies (deploy restart, provider outage, one bad stop rolling back the sweep) the stops stay at
 * latitude NULL with no evidence, and this engine can never fence them. Before building fences,
 * re-sweep every active load that still has an un-geocoded stop (never attempted, or last
 * attempted more than 6 hours ago) under the user who booked the load — real attribution, no
 * phantom system user (identity.users has none). Provider calls are paced inside the backfill.
 */
export async function resweepUngeocodedActiveStops(
  client: DbClient,
  operatingCompanyId: string,
): Promise<{ loads: number; stops_geocoded: number; failures: number }> {
  const { rows } = await client.query<{ load_id: string; actor_id: string | null }>(
    `SELECT DISTINCT l.id::text AS load_id, l.booked_by_user_id::text AS actor_id
       FROM mdata.loads l
       JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND ${canonicalDispatchWorkStatusClause("l")}
        AND (
          ((s.latitude IS NULL OR s.longitude IS NULL)
            AND (s.geocode_attempted_at IS NULL OR s.geocode_attempted_at < now() - interval '6 hours'))
          OR (
            -- same population the backfill itself sweeps: a street-level stop whose location has no
            -- active fence yet (13508's pickup: coordinates present, location_id present, 0 fences)
            s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.location_id IS NOT NULL
            AND coalesce(s.geocode_precision, 'rooftop') <> 'locality'
            AND NOT EXISTS (SELECT 1 FROM geo.geofences g
                             WHERE g.operating_company_id = $1::uuid AND g.location_ref_id = s.location_id AND g.is_active)
          )
        )
      ORDER BY load_id`,
    [operatingCompanyId],
  );
  let geocoded = 0;
  let failures = 0;
  let loads = 0;
  for (const row of rows) {
    if (!row.actor_id) continue; // no booking user on the row: nothing to attribute a location to; stays visible to verify-stops-geocoded
    loads += 1;
    const result = await geocodeStopsWithClient(client, row.actor_id, operatingCompanyId, row.load_id);
    geocoded += result.stops_geocoded;
    failures += result.failures.length;
  }
  return { loads, stops_geocoded: geocoded, failures };
}

export async function runLoadStopGeofenceSync(client: DbClient, operatingCompanyId: string): Promise<LoadStopGeofenceSyncResult> {
  const resweep = await resweepUngeocodedActiveStops(client, operatingCompanyId);
  const sync = await syncLoadStopGeofences(client, operatingCompanyId);
  const replay = await replayUnitHistoryForFences(client, operatingCompanyId, sync.loads, sync.newFenceIds);
  const stamps = retroStampEnabled()
    ? await stampStopsFromGeofenceEvents(client, operatingCompanyId)
    : { arrivals: 0, departures: 0 };
  const retired = await retireLoadStopGeofencesForInactiveLoads(client, operatingCompanyId);
  return {
    retro_stamp_enabled: retroStampEnabled(),
    fences_retired: retired,
    loads_scanned: sync.loads.length,
    fences_created: sync.created,
    fences_refreshed: sync.refreshed,
    fences_unchanged: sync.unchanged,
    stops_skipped_low_precision: sync.skipped,
    replay_positions_checked: replay.positions_checked,
    replay_events_written: replay.events_written,
    stops_stamped_arrival: stamps.arrivals,
    stops_stamped_departure: stamps.departures,
    geocode_resweep_loads: resweep.loads,
    geocode_resweep_stops_geocoded: resweep.stops_geocoded,
    geocode_resweep_failures: resweep.failures,
  };
}
