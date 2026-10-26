/**
 * ENGINE: GPS-dwell stop evidence — writes what the GPS-dwell boundary (stop-dwell-boundary.service.ts) found, so the stop
 * carries its own measured evidence and the canonical fence -> event -> odometer-capture -> driven-miles chain runs on it.
 * SCHEDULE: called by runLoadRealDrivenMilesCronTick (hourly, 25 * * * *) for the boundaries that resolved by GPS dwell.
 * WRITES (per GPS-verified stop, idempotent):
 *   1. telematics.unit_stop_events — the dwell (source 'load_stop_gps_dwell', load_id_at_time = the load); an existing row for
 *      the same unit + start/end (the stop writer's own) is reused, never duplicated (two natural-key unique indexes).
 *   2. mdata.load_stops.actual_stop_event_id — linked ONLY when NULL. The stop's actual times, its stamp source/precision and
 *      its document address are NEVER changed (detention reads actual_departure_at — dispatch/detention.service.ts).
 *   3. geo.geofences — the stop's GPS-verified fence (load-<id>-stop-<seq>-gps) at the dwell point, through the single
 *      minter module (bindVerifiedStopFence); the document fence is left as it is.
 *   4. geo.geofence_events — the unit's stored fixes over the dwell window (+- 2 h) replayed through the canonical detector
 *      (replayUnitWindowForFences, suppressOperationalSideEffects) — only when that fence has no event yet.
 *   The odometer-capture step (captureGeofenceOdometerEvents) then reads the real OBD odometer per crossing, and the next
 *   driven-miles compute resolves the stop through the geofence path.
 * IDEMPOTENCY: re-running writes nothing new (ON CONFLICT DO NOTHING, link only when NULL, fence unchanged on same point,
 *   replay only for a fence with no events).
 * NEVER: moves a stop, stamps a time, creates money, writes a frozen company (operating company is the load's).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { bindVerifiedStopFence } from "../dispatch/geofences/load-geofence-binding.service.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { normalizeVertices } from "./geofence.js";
import { replayUnitWindowForFences } from "./load-stop-geofence-sync.service.js";
import type { DwellHit } from "./stop-dwell-boundary.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type StopDwellEvidence = { load_id: string; stop_id: string; unit_id: string; sequence_number: number; hit: DwellHit };
export type StopDwellEvidenceResult = { stops: number; stop_events: number; stops_linked: number; fences: number; events_written: number };

export const DWELL_REPLAY_PAD_HOURS = 2;

export async function persistStopDwellEvidence(
  client: DbClient,
  operatingCompanyId: string,
  evidence: StopDwellEvidence[]
): Promise<StopDwellEvidenceResult> {
  const out: StopDwellEvidenceResult = { stops: 0, stop_events: 0, stops_linked: 0, fences: 0, events_written: 0 };
  // One dwell per stop (arrival and departure resolve to the same nearest dwell).
  const byStop = new Map<string, StopDwellEvidence>();
  for (const e of evidence) if (!byStop.has(e.stop_id)) byStop.set(e.stop_id, e);
  for (const e of byStop.values()) {
    out.stops += 1;
    // 1. the dwell as a stop event (reuse the stop writer's row for the same unit + start/end)
    const ins = await client.query<{ id: string }>(
      `INSERT INTO telematics.unit_stop_events (
         operating_company_id, unit_id, started_at, ended_at, dwell_minutes, sample_count, lat, lng,
         odometer_note, miles_note, load_id_at_time, source, updated_at)
       SELECT $1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8, $9, $10, l.id, 'load_stop_gps_dwell', now()
         FROM mdata.loads l WHERE l.id = $11::uuid AND l.operating_company_id = $1::uuid
       ON CONFLICT DO NOTHING
       RETURNING id::text`,
      [
        operatingCompanyId, e.unit_id, e.hit.started_at, e.hit.ended_at, e.hit.minutes, Math.max(1, e.hit.samples ?? 1), e.hit.lat, e.hit.lng,
        `GPS dwell verifying load stop ${e.sequence_number} (${e.hit.distance_m} m from the document point); odometer: geofence_odometer_captures`,
        "not computed for a stop-verification row",
        e.load_id,
      ]
    );
    let eventId = ins.rows[0]?.id ?? null;
    if (eventId) out.stop_events += 1;
    else {
      eventId = (await client.query<{ id: string }>(
        `SELECT id::text FROM telematics.unit_stop_events
          WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid AND (started_at = $3::timestamptz OR ended_at = $4::timestamptz)
          ORDER BY started_at LIMIT 1`,
        [operatingCompanyId, e.unit_id, e.hit.started_at, e.hit.ended_at]
      )).rows[0]?.id ?? null;
    }
    // 2. link the evidence on the stop, only when the stop carries none (times / source / precision untouched)
    if (eventId) {
      const linked = await client.query<{ id: string }>(
        `UPDATE mdata.load_stops s SET actual_stop_event_id = $2::uuid
           FROM mdata.loads l
          WHERE s.id = $1::uuid AND l.id = s.load_id AND l.operating_company_id = $3::uuid AND s.actual_stop_event_id IS NULL
          RETURNING s.id::text`,
        [e.stop_id, eventId, operatingCompanyId]
      );
      out.stops_linked += linked.rows.length;
    }
    // 3. the GPS-verified fence at the dwell point (single minter)
    const fence = await bindVerifiedStopFence(client as never, operatingCompanyId, e.load_id, e.sequence_number, { lat: e.hit.lat, lng: e.hit.lng });
    if (fence.outcome !== "unchanged") out.fences += 1;
    // 4. replay the dwell window through the canonical detector, once per fence
    const seen = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM geo.geofence_events WHERE operating_company_id = $1::uuid AND geofence_id = $2::uuid AND unit_id = $3::uuid`,
      [operatingCompanyId, fence.id, e.unit_id]
    );
    let replayed = 0;
    if (Number(seen.rows[0]?.n ?? 0) === 0) {
    const v = await client.query<{ vertices_json: unknown }>(`SELECT vertices_json FROM geo.geofences WHERE id = $1::uuid`, [fence.id]);
    const pad = DWELL_REPLAY_PAD_HOURS * 3_600_000;
    const r = await replayUnitWindowForFences(
      client as never, operatingCompanyId, e.unit_id,
      [{ id: fence.id, vertices: normalizeVertices(v.rows[0]?.vertices_json) }],
      new Date(Date.parse(e.hit.started_at) - pad).toISOString(),
      new Date(Date.parse(e.hit.ended_at) + pad).toISOString()
    );
    replayed = r.events_written;
    out.events_written += r.events_written;
    }
    if (ins.rows.length || fence.outcome !== "unchanged" || replayed > 0) {
      await appendCrudAudit(
        client as never,
        SYSTEM_ACTOR_USER_ID,
        "telematics.load_stop.gps_dwell_verified",
        {
          resource_type: "mdata.load_stops", resource_id: e.stop_id, load_id: e.load_id, operating_company_id: operatingCompanyId,
          unit_id: e.unit_id, stop_sequence: e.sequence_number, stop_event_id: eventId, gps_fence_id: fence.id,
          dwell_started_at: e.hit.started_at, dwell_ended_at: e.hit.ended_at, dwell_minutes: e.hit.minutes,
          distance_from_document_point_m: e.hit.distance_m, crossings_written: replayed,
        },
        "info",
        "LEAD-GPS-DWELL-STOP-EVIDENCE"
      );
    }
  }
  return out;
}
