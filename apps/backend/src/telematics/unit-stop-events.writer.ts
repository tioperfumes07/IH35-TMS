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
import { driverAtTimeSql, loadAtTimeSql } from "../maintenance/driver-attribution.js";
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

export async function writeUnitStopEvents(
  client: DbClient,
  operatingCompanyId: string,
  now = new Date(),
  /** Catch-up only: real Samsara odometer history per unit (stats/history), used as extra odometer candidates. */
  odometerHistoryByUnit?: Map<string, PositionFix[]>
): Promise<StopWriterSummary> {
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
    // Odometer candidates: the fixes' own odometer PLUS the unit's real Samsara odometer readings
    // (telematics.odometer_readings). GPS fixes only carry odometer since E-01 (2026-10-01); every older
    // stop would otherwise have no reading and E-05 could not measure its leg. Same tolerance rule applies
    // (attachNearestOdometer) -- a reading too far from the stop is never used, never interpolated.
    const readings = await client.query(
      `SELECT read_at, odometer_miles FROM telematics.odometer_readings
        WHERE unit_id = $1::uuid AND read_at BETWEEN $2::timestamptz AND $3::timestamptz AND odometer_miles IS NOT NULL`,
      [unit.unitId, from.toISOString(), now.toISOString()]
    );
    const odoCandidates: PositionFix[] = [
      ...fixes.filter((f) => f.odometerMi !== null),
      ...readings.rows.map((r: any) => ({
        capturedAt: new Date(r.read_at), lat: null, lng: null, speedMph: null, engineState: null,
        odometerMi: Number(r.odometer_miles), city: null, state: null,
      }) as PositionFix),
      ...(odometerHistoryByUnit?.get(unit.unitId) ?? []).filter((f) => f.capturedAt >= from && f.capturedAt <= now),
    ];
    // ROUND 330.7: a stop already in progress when the window opens is CLIPPED — detectStops starts it at the window's
    // first fix, a little later on every tick as the window slides, so the (unit_id, started_at) key never matched and
    // each tick inserted the same physical stop again (prod 2026-10-02: 1,258 rows for 122 stops). Its true start lies
    // before the window; an earlier tick (or the 10-day catch-up) wrote it with that start. Skip it here. Miles are
    // computed before the filter, so the next stop keeps its miles_since_previous_stop.
    const firstFixAt = fixes[0]?.capturedAt.getTime();
    const stops: StopWithMiles[] = milesBetweenStops(
      detectStops(unit.unitId, fixes).map((s) => attachNearestOdometer(s, odoCandidates))
    ).filter((s) => s.startedAt.getTime() !== firstFixAt);
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
        `SELECT driver_at_time.driver_id::text AS driver_id, load_at_time.load_id::text AS load_id
           FROM mdata.units u
           ${driverAtTimeSql("u.id", "$3::timestamptz")}
           ${loadAtTimeSql("u.id", "$3::timestamptz")}
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

/**
 * Catch-up: re-run the 36 h writer over consecutive windows (6 h overlap) reaching `days` back. The writer
 * upserts on (unit_id, started_at), so a re-read stop is updated, never duplicated. Runs once a day so a stop
 * missed by a late GPS batch -- or every stop before the writer first ran (2026-09-29) -- still gets a row, and
 * E-05 can classify legs whose pickup predates the 15-minute cadence.
 */
export async function writeUnitStopEventsCatchUp(
  client: DbClient,
  operatingCompanyId: string,
  days = 10,
  now = new Date(),
  /** Real odometer history source (Samsara stats/history). Omitted -> local readings only. */
  fetchOdometerHistory?: (samsaraVehicleIds: string[], startIso: string, endIso: string) => Promise<Map<string, Array<{ at: Date; miles: number }>>>
) {
  const stepMs = (STOP_WRITER_WINDOW_HOURS - 6) * 3_600_000;
  const floor = now.getTime() - days * 86_400_000;
  let historyByUnit: Map<string, PositionFix[]> | undefined;
  let historyReadings = 0;
  if (fetchOdometerHistory) {
    const units = await client.query(
      `SELECT u.id::text AS unit_id, u.samsara_vehicle_id::text AS vid FROM mdata.units u
        WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          AND u.samsara_vehicle_id IS NOT NULL AND u.deactivated_at IS NULL AND COALESCE(u.is_sample_data, false) = false`,
      [operatingCompanyId]
    );
    const unitByVid = new Map(units.rows.map((r: any) => [String(r.vid), String(r.unit_id)]));
    historyByUnit = new Map();
    const vids = [...unitByVid.keys()];
    for (let i = 0; i < vids.length; i += 10) {
      // one day per call keeps each page small (~1,250 readings per truck-day)
      for (let t = floor - stepMs; t < now.getTime(); t += 86_400_000) {
        const hist = await fetchOdometerHistory(vids.slice(i, i + 10), new Date(t).toISOString(), new Date(Math.min(t + 86_400_000, now.getTime())).toISOString());
        for (const [vid, pts] of hist) {
          const unitId = unitByVid.get(vid);
          if (!unitId) continue;
          const list = historyByUnit.get(unitId) ?? [];
          for (const p of pts) list.push({ capturedAt: p.at, lat: null, lng: null, speedMph: null, engineState: null, odometerMi: p.miles, city: null, state: null } as PositionFix);
          historyByUnit.set(unitId, list);
          historyReadings += pts.length;
        }
      }
    }
  }
  const windows: StopWriterSummary[] = [];
  for (let t = now.getTime(); t - STOP_WRITER_WINDOW_HOURS * 3_600_000 > floor - stepMs; t -= stepMs) {
    windows.push(await writeUnitStopEvents(client, operatingCompanyId, new Date(t), historyByUnit));
  }
  return {
    operatingCompanyId, days, windows: windows.length, odometerHistoryReadings: historyReadings,
    rowsUpserted: windows.reduce((s, w) => s + w.rowsUpserted, 0),
    stopsDetected: windows.reduce((s, w) => s + w.stopsDetected, 0),
  };
}
