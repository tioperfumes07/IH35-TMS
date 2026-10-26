/**
 * ENGINE: GPS-dwell stop boundary — the truck's own dwell is the stop when the stop's fence was never entered.
 * WHY (owner 2026-10-11: "Probably the gps is source of truth or verification"; owner 2026-10-25 9:37 PM CT: "the system is
 *   supposed to do it automatically not you"): measured 2026-10-25 under bypass — 92 completed USMCA loads had no real driven
 *   miles because the stop's point sits ~1 mi off the real dock, so the truck never entered the fence drawn on it (load 13510,
 *   1200 Fuller Road Linden NJ: nearest fix 1.08 mi; 13652 Semares: 1.34 mi). The truck DID stop there — its dwell is the
 *   measurement the fence was meant to capture.
 * HOW (pure pick + one read per unit window; called by computeLoadRealDrivenMiles, which runs in the hourly real-driven-miles cron):
 *   1. Only for a boundary with NO geofence capture and NO device-recorded stop time (those always win).
 *   2. The unit's stored fixes (telematics.vehicle_locations) over the stop time +- DWELL_BOUNDARY_WINDOW_HOURS -> dwells by
 *      detectStops (the same detector as the stop-odometer capture), at least DWELL_BOUNDARY_MIN_MINUTES long.
 *   3. A dwell at a fuel stop / the company yard / the owner's non-shipper Samsara addresses is never a stop
 *      (loadDwellExclusionZones — shared with the stop GPS verification engine).
 *   4. The nearest remaining dwell within DWELL_BOUNDARY_RADIUS_M of the stop's point is the stop: arrival = dwell start,
 *      departure = dwell end. The odometer at that time comes from the shared odometer-anchor rule (fetchOdometerAnchors) —
 *      read, never interpolated.
 *   5. Evidence travels with the leg: the leg source names gps_dwell, the dwell window and its distance from the stop's point.
 * NEVER: moves the stop, rewrites its document address or its stamped times, writes a GPS row, uses a dwell beyond the radius,
 *   or returns a figure without a dwell — no dwell -> NULL with the precise reason.
 * Master locations: the stop's point is NOT corrected here. No rule in the repo authorises moving a master location from
 *   dwells; the GPS-verified correction of a stop's facility stays with stop-gps-verification.service.ts (confirmed
 *   facilities only).
 */
import { detectStops, type PositionFix } from "./stop-odometer-capture.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** 3 miles: docks and lots of a large facility sit off the geocoded pin (measured 1.08-1.34 mi on the first two). */
export const DWELL_BOUNDARY_RADIUS_M = 4828;
/** A loading / unloading stop, not a red light or a short pause. */
export const DWELL_BOUNDARY_MIN_MINUTES = 10;
/** Same matching window the geofence capture uses (GEOFENCE_MATCH_WINDOW_HOURS). */
export const DWELL_BOUNDARY_WINDOW_HOURS = 48;

export type DwellZone = { lat: number; lng: number; r: number };
export type DwellCandidate = { startedAt: Date; endedAt: Date; dwellMinutes: number; lat: number; lng: number };
export type DwellHit = { at: string; started_at: string; ended_at: string; minutes: number; distance_m: number };
export type DwellPick = { hit: DwellHit | null; reason: string | null };
export type DwellRequest = { key: string; unit_id: string; lat: number; lng: number; at: string; side: "arrival" | "departure" };

const HOUR_MS = 3_600_000;

export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Pure: the GPS-verified dwell for one stop boundary, or the precise reason there is none. */
export function pickStopDwell(
  side: "arrival" | "departure",
  stop: { lat: number; lng: number },
  refAt: Date,
  dwells: DwellCandidate[],
  zones: DwellZone[],
  hasFixes: boolean
): DwellPick {
  if (!hasFixes) return { hit: null, reason: `no GPS fixes for the truck within ${DWELL_BOUNDARY_WINDOW_HOURS} h of the stop time` };
  const lo = refAt.getTime() - DWELL_BOUNDARY_WINDOW_HOURS * HOUR_MS;
  const hi = refAt.getTime() + DWELL_BOUNDARY_WINDOW_HOURS * HOUR_MS;
  const usable = dwells.filter(
    (d) =>
      d.endedAt.getTime() >= lo && d.startedAt.getTime() <= hi &&
      d.dwellMinutes >= DWELL_BOUNDARY_MIN_MINUTES &&
      !zones.some((z) => metresBetween(d.lat, d.lng, z.lat, z.lng) <= z.r)
  );
  if (usable.length === 0) {
    return { hit: null, reason: `no truck dwell of ${DWELL_BOUNDARY_MIN_MINUTES} min or more within ${DWELL_BOUNDARY_WINDOW_HOURS} h of the stop time (fuel stops and the yard excluded)` };
  }
  const scored = usable
    .map((d) => ({ d, m: metresBetween(d.lat, d.lng, stop.lat, stop.lng) }))
    .sort((a, b) => a.m - b.m || Math.abs(a.d.startedAt.getTime() - refAt.getTime()) - Math.abs(b.d.startedAt.getTime() - refAt.getTime()));
  const best = scored[0]!;
  if (best.m > DWELL_BOUNDARY_RADIUS_M) {
    return { hit: null, reason: `nearest truck dwell is ${Math.round(best.m)} m from the stop — beyond the ${DWELL_BOUNDARY_RADIUS_M} m (3 mi) GPS-verification radius` };
  }
  const started = best.d.startedAt.toISOString();
  const ended = best.d.endedAt.toISOString();
  return {
    hit: { at: side === "arrival" ? started : ended, started_at: started, ended_at: ended, minutes: best.d.dwellMinutes, distance_m: Math.round(best.m) },
    reason: null,
  };
}

/** The leg-source tag that carries the evidence (shown as the tooltip on the load's real-driven-miles section). */
export function dwellVia(hit: DwellHit): string {
  return `gps_dwell ${hit.started_at.slice(0, 16)}Z..${hit.ended_at.slice(11, 16)}Z ${hit.distance_m} m from stop`;
}

/** Fuel stops, the company yard and the owner's non-shipper Samsara addresses: a dwell there is never a pickup / delivery. */
export async function loadDwellExclusionZones(client: DbClient, operatingCompanyId: string): Promise<DwellZone[]> {
  const fences = (await client.query<{ lat: number; lng: number; r: number }>(
    `SELECT center_lat::float8 AS lat, center_lng::float8 AS lng, greatest(coalesce(enter_radius_m, radius_m, 200), 200)::float8 AS r
       FROM geo.geofences WHERE operating_company_id = $1::uuid AND is_active AND center_lat IS NOT NULL
        AND (location_kind = 'fuel_stop' OR location_kind = 'yard'
             OR location_ref_id IN (SELECT id FROM mdata.locations WHERE operating_company_id = $1::uuid AND is_ih35_yard))`,
    [operatingCompanyId])).rows;
  // The owner's own non-shipper addresses in Samsara (the EBT yard, CAT / weigh scales, fuel and truck stops) — measured
  // 2026-10-11: 69 of the first run's 175 "disagreements" were the EBT Yard and 22 were CAT scales.
  const notShipper = (await client.query<{ lat: number; lng: number }>(
    `SELECT lat::float8 AS lat, lng::float8 AS lng FROM integrations.samsara_addresses
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
        AND coalesce(name, '') ~* '(yard|cat scale|scale|weigh|love''?s|pilot|flying j|petro|truck ?stop|travel ?center|wash)'`,
    [operatingCompanyId])).rows.map((r) => ({ ...r, r: 400 }));
  return [...fences, ...notShipper];
}

/**
 * Resolve many dwell boundaries: one fixes read per unit per merged time window. Read-only.
 * Units are the load's truck (mdata.units are scoped by COALESCE(currently_leased_to_company_id, owner_company_id) at the
 * load level — the request only carries the load's own assigned unit).
 */
export async function fetchStopDwells(
  client: DbClient,
  operatingCompanyId: string,
  requests: DwellRequest[]
): Promise<Map<string, DwellPick>> {
  const out = new Map<string, DwellPick>();
  if (requests.length === 0) return out;
  const zones = await loadDwellExclusionZones(client, operatingCompanyId);
  const byUnit = new Map<string, DwellRequest[]>();
  for (const q of requests) byUnit.set(q.unit_id, [...(byUnit.get(q.unit_id) ?? []), q]);
  const W = DWELL_BOUNDARY_WINDOW_HOURS * HOUR_MS;
  for (const [unitId, list] of byUnit) {
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    // merge overlapping [at - W, at + W] windows into one read each
    const windows: Array<{ from: number; to: number; reqs: DwellRequest[] }> = [];
    for (const q of sorted) {
      const t = Date.parse(q.at);
      const last = windows[windows.length - 1];
      if (last && t - W <= last.to) { last.to = Math.max(last.to, t + W); last.reqs.push(q); }
      else windows.push({ from: t - W, to: t + W, reqs: [q] });
    }
    for (const w of windows) {
      const rows = (await client.query<{ captured_at: string; lat: string | null; lng: string | null; speed_mph: string | null; engine_state: string | null; odometer_mi: string | null; city: string | null; state: string | null }>(
        `SELECT captured_at::text, lat::text, lng::text, speed_mph::text, engine_state, odometer_mi::text, city, state
           FROM telematics.vehicle_locations
          WHERE unit_id = $1::uuid AND captured_at BETWEEN $2::timestamptz AND $3::timestamptz
          ORDER BY captured_at`,
        [unitId, new Date(w.from).toISOString(), new Date(w.to).toISOString()])).rows;
      const fixes: PositionFix[] = rows.map((f) => ({
        capturedAt: new Date(f.captured_at), lat: f.lat == null ? null : Number(f.lat), lng: f.lng == null ? null : Number(f.lng),
        speedMph: f.speed_mph == null ? null : Number(f.speed_mph), engineState: f.engine_state,
        odometerMi: f.odometer_mi == null ? null : Number(f.odometer_mi), city: f.city, state: f.state,
      }));
      const dwells: DwellCandidate[] = detectStops(unitId, fixes)
        .filter((d) => d.lat != null && d.lng != null)
        .map((d) => ({ startedAt: d.startedAt, endedAt: d.endedAt, dwellMinutes: d.dwellMinutes, lat: d.lat as number, lng: d.lng as number }));
      for (const q of w.reqs) {
        const t = Date.parse(q.at);
        const hasFixes = fixes.some((f) => Math.abs(f.capturedAt.getTime() - t) <= W);
        out.set(q.key, pickStopDwell(q.side, { lat: q.lat, lng: q.lng }, new Date(q.at), dwells, zones, hasFixes));
      }
    }
  }
  return out;
}
