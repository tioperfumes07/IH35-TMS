/**
 * E-44 — Stops + miles read surface over E-03 stop-odometer capture (Round 306).
 * Computed on read until unit_stop_events is persisted.
 */
import type { PoolClient } from "pg";
import {
  attachNearestOdometer,
  detectStops,
  geofenceForStopSql,
  milesBetweenStops,
  unitFixesSql,
  type PositionFix,
  type StopWithMiles,
} from "./stop-odometer-capture.service.js";

export const STOP_EVENTS_DEFAULT_HOURS = 24;
export const STOP_EVENTS_MAX_HOURS = 168;

type FixRow = {
  captured_at: string | Date;
  lat: string | number | null;
  lng: string | number | null;
  speed_mph: string | number | null;
  engine_state: string | null;
  odometer_mi: string | number | null;
  city: string | null;
  state: string | null;
};

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toFix(r: FixRow): PositionFix {
  return {
    capturedAt: new Date(r.captured_at),
    lat: num(r.lat),
    lng: num(r.lng),
    speedMph: num(r.speed_mph),
    engineState: r.engine_state,
    odometerMi: num(r.odometer_mi),
    city: r.city,
    state: r.state,
  };
}

export type StopEventRow = {
  unit_id: string;
  unit_number: string | null;
  started_at: string;
  ended_at: string;
  dwell_minutes: number;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  odometer_mi: number | null;
  odometer_note: string;
  miles_since_previous_stop: number | null;
  miles_note: string;
  geofence_id: string | null;
  geofence_label: string | null;
  driver_id: string | null;
  driver_label: string | null;
};

async function stopsForUnit(
  client: PoolClient,
  operatingCompanyId: string,
  unitId: string,
  fromIso: string,
  toIso: string
): Promise<StopEventRow[]> {
  const unitRes = await client.query<{ unit_number: string | null }>(
    `SELECT unit_number FROM mdata.units WHERE id = $1::uuid`,
    [unitId]
  );
  const unitNumber = unitRes.rows[0]?.unit_number ?? null;

  const fixRes = await client.query<FixRow>(unitFixesSql(), [unitId, fromIso, toIso]);
  const fixes = fixRes.rows.map(toFix);
  const candidates = fixes.filter((f) => f.odometerMi !== null);
  const detected = detectStops(unitId, fixes).map((s) => attachNearestOdometer(s, candidates));
  const withMiles: StopWithMiles[] = milesBetweenStops(detected);

  const rows: StopEventRow[] = [];
  for (const s of withMiles) {
    let geofenceId: string | null = null;
    let geofenceLabel: string | null = null;
    if (s.lat != null && s.lng != null) {
      try {
        const g = await client.query<{ geofence_id: string; label: string | null }>(geofenceForStopSql(), [
          operatingCompanyId,
          s.lat,
          s.lng,
        ]);
        geofenceId = g.rows[0]?.geofence_id ?? null;
        geofenceLabel = g.rows[0]?.label ?? null;
      } catch {
        // fence lookup is enrichment — never fail the stop list
      }
    }

    let driverId: string | null = null;
    let driverLabel: string | null = null;
    const drv = await client.query<{ driver_id: string | null; driver_label: string | null }>(
      `
        SELECT vda.driver_id::text AS driver_id,
               (d.first_name || ' ' || d.last_name) AS driver_label
          FROM telematics.vehicle_driver_assignments vda
          LEFT JOIN mdata.drivers d ON d.id = vda.driver_id
         WHERE vda.unit_id = $1::uuid
           AND vda.started_at <= $2::timestamptz
           AND (vda.ended_at IS NULL OR vda.ended_at >= $2::timestamptz)
         ORDER BY vda.started_at DESC
         LIMIT 1
      `,
      [unitId, s.startedAt.toISOString()]
    );
    driverId = drv.rows[0]?.driver_id ?? null;
    driverLabel = drv.rows[0]?.driver_label ?? null;

    rows.push({
      unit_id: unitId,
      unit_number: unitNumber,
      started_at: s.startedAt.toISOString(),
      ended_at: s.endedAt.toISOString(),
      dwell_minutes: s.dwellMinutes,
      lat: s.lat,
      lng: s.lng,
      city: s.city,
      state: s.state,
      odometer_mi: s.odometerMi,
      odometer_note: s.odometerNote,
      miles_since_previous_stop: s.milesSincePreviousStop,
      miles_note: s.milesNote,
      geofence_id: geofenceId,
      geofence_label: geofenceLabel,
      driver_id: driverId,
      driver_label: driverLabel,
    });
  }
  return rows;
}

export async function fetchStopEvents(
  client: PoolClient,
  operatingCompanyId: string,
  opts: { unitId?: string; driverId?: string; hours: number }
): Promise<{ rows: StopEventRow[]; resolved: string; hours: number; computed: true }> {
  const to = new Date();
  const from = new Date(to.getTime() - opts.hours * 3_600_000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  if (opts.unitId) {
    const rows = await stopsForUnit(client, operatingCompanyId, opts.unitId, fromIso, toIso);
    return { rows, resolved: "forward_by_unit", hours: opts.hours, computed: true };
  }

  if (opts.driverId) {
    // Units this driver held in the window (assignment overlap).
    const units = await client.query<{ unit_id: string }>(
      `
        SELECT DISTINCT vda.unit_id::text AS unit_id
          FROM telematics.vehicle_driver_assignments vda
         WHERE vda.driver_id = $1::uuid
           AND vda.started_at <= $3::timestamptz
           AND (vda.ended_at IS NULL OR vda.ended_at >= $2::timestamptz)
      `,
      [opts.driverId, fromIso, toIso]
    );
    const all: StopEventRow[] = [];
    for (const u of units.rows) {
      const stops = await stopsForUnit(client, operatingCompanyId, u.unit_id, fromIso, toIso);
      all.push(...stops.filter((s) => s.driver_id === opts.driverId));
    }
    all.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    return { rows: all, resolved: "reverse_by_driver", hours: opts.hours, computed: true };
  }

  return { rows: [], resolved: "none", hours: opts.hours, computed: true };
}
