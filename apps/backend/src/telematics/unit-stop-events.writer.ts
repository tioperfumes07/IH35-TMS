/**
 * ROUND 306 E-03 — persist stop-odometer captures into telematics.unit_stop_events.
 *
 * Runs the pure engine (stop-odometer-capture.service.ts) over each LIVE unit's fixes for a
 * trailing window and UPSERTS the result keyed on (unit_id, started_at). Re-running a window never
 * duplicates; a stop that lengthened since the last tick (the truck is still parked) is UPDATED in
 * place with the longer dwell and the newer median odometer.
 *
 * Linkage written on every row, both directions resolvable:
 *   unit            FK mdata.units
 *   geofence        the containing fence, if any -- an ATTRIBUTE, never the trigger
 *   driver_at_time  driverAtTimeSql (maintenance/driver-attribution.ts), never re-inlined
 *   load_at_time    the load whose assigned_unit_id is this unit and whose window spans the stop
 * Odometer is READ or NULL. The CHECK constraints in the migration refuse an inconsistent row and a
 * negative miles delta, so a bad write fails loudly at the table rather than silently in a report.
 */
import { driverAtTimeSql } from "../maintenance/driver-attribution.js";
import {
  attachNearestOdometer,
  detectStops,
  geofenceForStopSql,
  milesBetweenStops,
  unitFixesSql,
  type PositionFix,
  type StopWithMiles,
} from "./stop-odometer-capture.service.js";
import { classifyFleetUnit, fleetUnitFactsSql, liveFleet } from "./live-fleet.js";

type DbClient = { query: <T = any>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** Trailing window per tick. 36 h so a stop straddling midnight and its predecessor both land. */
export const STOP_WRITER_WINDOW_HOURS = 36;

export type StopWriterSummary = {
  operatingCompanyId: string;
  liveUnits: number;
  stopsDetected: number;
  stopsWithOdometer: number;
  stopsWithMiles: number;
  stopsInAFence: number;
  rowsUpserted: number;
};

function rowsToFixes(rows: any[]): PositionFix[] {
  return rows.map((r) => ({
    capturedAt: new Date(r.captured_at),
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
    speedMph: r.speed_mph === null ? null : Number(r.speed_mph),
    engineState: r.engine_state,
    odometerMi: r.odometer_mi === null ? null : Number(r.odometer_mi),
    city: r.city,
    state: r.state,
  }));
}

export async function writeUnitStopEvents(client: DbClient, operatingCompanyId: string, now = new Date()): Promise<StopWriterSummary> {
  const facts = await client.query(fleetUnitFactsSql(), [operatingCompanyId]);
  const live = liveFleet(
    facts.rows.map((r: any) =>
      classifyFleetUnit(
        {
          unitId: r.unit_id,
          unitNumber: r.unit_number,
          isSampleData: r.is_sample_data,
          lastGpsAt: r.last_gps_at ? new Date(r.last_gps_at) : null,
          everHadOdometer: r.ever_had_odometer,
        },
        now
      )
    )
  );

  const from = new Date(now.getTime() - STOP_WRITER_WINDOW_HOURS * 3_600_000);
  const summary: StopWriterSummary = {
    operatingCompanyId, liveUnits: live.length, stopsDetected: 0, stopsWithOdometer: 0,
    stopsWithMiles: 0, stopsInAFence: 0, rowsUpserted: 0,
  };

  for (const unit of live) {
    const fixRes = await client.query(unitFixesSql(), [unit.unitId, from.toISOString(), now.toISOString()]);
    const fixes = rowsToFixes(fixRes.rows);
    const odoCandidates = fixes.filter((f) => f.odometerMi !== null);
    const stops: StopWithMiles[] = milesBetweenStops(
      detectStops(unit.unitId, fixes).map((s) => attachNearestOdometer(s, odoCandidates))
    );
    summary.stopsDetected += stops.length;

    for (const s of stops) {
      if (s.odometerMi !== null) summary.stopsWithOdometer++;
      if (s.milesSincePreviousStop !== null) summary.stopsWithMiles++;

      // Containing geofence: an attribute. Only counts as "inside" within the fence's own radius.
      let fence: { geofence_id: string; label: string; location_kind: string; metres_from_centre: number } | null = null;
      if (s.lat !== null && s.lng !== null) {
        const g = await client.query(geofenceForStopSql(), [operatingCompanyId, s.lat, s.lng]);
        const cand = g.rows[0];
        if (cand) {
          const radius = await client.query(
            `SELECT coalesce(enter_radius_m, radius_m, 0) AS r FROM geo.geofences WHERE id = $1::uuid`,
            [cand.geofence_id]
          );
          const r = Number(radius.rows[0]?.r ?? 0);
          if (r > 0 && Number(cand.metres_from_centre) <= r) {
            fence = cand;
            summary.stopsInAFence++;
          }
        }
      }

      // Driver and load at the stop START, resolved at read time -- never stored from a stale FK.
      const ctx = await client.query(
        `SELECT driver_at_time.driver_id::text AS driver_id,
                (SELECT l.id::text FROM mdata.loads l
                  WHERE l.operating_company_id = $1::uuid
                    AND l.assigned_unit_id = u.id
                    AND coalesce(l.is_sample_data, false) = false
                    AND l.created_at <= $3::timestamptz
                    AND (l.delivered_at IS NULL OR l.delivered_at >= $3::timestamptz)
                  ORDER BY l.created_at DESC LIMIT 1) AS load_id
           FROM mdata.units u
           ${driverAtTimeSql("u.id", "$3::timestamptz")}
          WHERE u.id = $2::uuid`,
        [operatingCompanyId, unit.unitId, s.startedAt.toISOString()]
      );
      const c = ctx.rows[0] ?? { driver_id: null, load_id: null };

      await client.query(
        `INSERT INTO telematics.unit_stop_events (
           operating_company_id, unit_id, started_at, ended_at, dwell_minutes, sample_count,
           lat, lng, city, state,
           odometer_mi, odometer_read_at, odometer_age_minutes, odometer_note,
           miles_since_previous_stop, miles_note,
           geofence_id, geofence_label, geofence_kind, metres_from_fence_centre,
           driver_id_at_time, load_id_at_time, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5, $6,
           $7, $8, $9, $10,
           $11, $12::timestamptz, $13, $14,
           $15, $16,
           $17::uuid, $18, $19, $20,
           $21::uuid, $22::uuid, now()
         )
         ON CONFLICT (unit_id, started_at) DO UPDATE SET
           ended_at = EXCLUDED.ended_at, dwell_minutes = EXCLUDED.dwell_minutes, sample_count = EXCLUDED.sample_count,
           lat = EXCLUDED.lat, lng = EXCLUDED.lng, city = EXCLUDED.city, state = EXCLUDED.state,
           odometer_mi = EXCLUDED.odometer_mi, odometer_read_at = EXCLUDED.odometer_read_at,
           odometer_age_minutes = EXCLUDED.odometer_age_minutes, odometer_note = EXCLUDED.odometer_note,
           miles_since_previous_stop = EXCLUDED.miles_since_previous_stop, miles_note = EXCLUDED.miles_note,
           geofence_id = EXCLUDED.geofence_id, geofence_label = EXCLUDED.geofence_label,
           geofence_kind = EXCLUDED.geofence_kind, metres_from_fence_centre = EXCLUDED.metres_from_fence_centre,
           driver_id_at_time = EXCLUDED.driver_id_at_time, load_id_at_time = EXCLUDED.load_id_at_time,
           updated_at = now()`,
        [
          operatingCompanyId, unit.unitId, s.startedAt.toISOString(), s.endedAt.toISOString(), s.dwellMinutes, s.sampleCount,
          s.lat, s.lng, s.city, s.state,
          s.odometerMi, s.odometerReadAt ? s.odometerReadAt.toISOString() : null, s.odometerAgeMinutes, s.odometerNote,
          s.milesSincePreviousStop, s.milesNote,
          fence?.geofence_id ?? null, fence?.label ?? null, fence?.location_kind ?? null, fence ? Number(Number(fence.metres_from_centre).toFixed(1)) : null,
          c.driver_id, c.load_id,
        ]
      );
      summary.rowsUpserted++;
    }
  }
  return summary;
}
