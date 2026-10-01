/**
 * ROUND 306 E-04 — the consumer that joins E-03 (every stop >= 3 min, anywhere) to E-04 (fence
 * crossings with their odometer). Read-only, computed on read like E-03 itself (its table is the
 * Lead's pending migration).
 *
 * Forward: unit -> its stops, each with the containing fence (attribute, never trigger) and that
 * fence's entered/exited crossing captures. Reverse: geofence -> the stops made inside it.
 * Driver-at-time via driverAtTimeSql (never re-inlined).
 */
import { driverAtTimeSql } from "../maintenance/driver-attribution.js";
import { loadFenceCapturesForStop, type StopFenceCaptures } from "../integrations/samsara/geofences/geofence-odometer-capture.service.js";
import {
  attachNearestOdometer,
  detectStops,
  geofenceForStopSql,
  milesBetweenStops,
  unitFixesSql,
  type PositionFix,
  type StopWithMiles,
} from "./stop-odometer-capture.service.js";

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type UnitStopRow = StopWithMiles & {
  driver_id: string | null;
  fence: { geofence_id: string; label: string | null; location_kind: string | null; metres_from_centre: number; captures: StopFenceCaptures } | null;
};

export async function computeUnitStops(
  client: Db,
  input: { operatingCompanyId: string; unitId: string; fromIso: string; toIso: string; geofenceId?: string }
): Promise<{ unit_id: string; window: { from: string; to: string }; stops: UnitStopRow[]; counts: { stops: number; in_fence: number; with_fence_capture: number } }> {
  const res = await client.query(unitFixesSql(), [input.unitId, input.fromIso, input.toIso]);
  const fixes: PositionFix[] = res.rows.map((r) => ({
    capturedAt: new Date(String(r.captured_at)),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    speedMph: r.speed_mph == null ? null : Number(r.speed_mph),
    engineState: (r.engine_state as string | null) ?? null,
    odometerMi: r.odometer_mi == null ? null : Number(r.odometer_mi),
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
  }));
  const odo = fixes.filter((f) => f.odometerMi !== null);
  const stops = milesBetweenStops(detectStops(input.unitId, fixes).map((s) => attachNearestOdometer(s, odo)));

  const out: UnitStopRow[] = [];
  for (const s of stops) {
    let fence: UnitStopRow["fence"] = null;
    if (s.lat !== null && s.lng !== null) {
      const g = (await client.query(geofenceForStopSql(), [input.operatingCompanyId, s.lat, s.lng])).rows[0];
      const metres = g ? Number(g.metres_from_centre) : NaN;
      if (g && Number.isFinite(metres) && g.radius_m != null && metres <= Number(g.radius_m)) {
        const captures = await loadFenceCapturesForStop(client as never, {
          operatingCompanyId: input.operatingCompanyId,
          unitId: input.unitId,
          geofenceId: String(g.geofence_id),
          startedAt: s.startedAt,
          endedAt: s.endedAt,
        });
        fence = { geofence_id: String(g.geofence_id), label: (g.label as string | null) ?? null, location_kind: (g.location_kind as string | null) ?? null, metres_from_centre: Math.round(metres), captures };
      }
    }
    if (input.geofenceId && fence?.geofence_id !== input.geofenceId) continue;
    const drv = await client.query(
      `SELECT driver_at_time.driver_id::text AS driver_id FROM (SELECT 1) _one ${driverAtTimeSql("$2::uuid", "$3::timestamptz")}`,
      [input.operatingCompanyId, input.unitId, s.startedAt.toISOString()]
    );
    out.push({ ...s, driver_id: (drv.rows[0]?.driver_id as string | null) ?? null, fence });
  }
  return {
    unit_id: input.unitId,
    window: { from: input.fromIso, to: input.toIso },
    stops: out,
    counts: {
      stops: out.length,
      in_fence: out.filter((x) => x.fence).length,
      with_fence_capture: out.filter((x) => x.fence && (x.fence.captures.entered || x.fence.captures.exited)).length,
    },
  };
}
