/**
 * ROUND 304 T-47 — REAL DRIVEN MILES PER LEG, off the geofence crossings we already capture.
 *
 * A leg = the unit EXITS a stop (fuel stop, customer site, yard, ...) and next ENTERS a stop.
 * miles = odometer at that entry - odometer at that exit. The odometer is a cumulative counter, so
 * two REAL endpoint readings give an exact distance no matter what happened in between.
 *
 * NEVER INTERPOLATE. telematics.geofence_odometer_captures labels each crossing real_obd /
 * interpolated / absent (T-21). 'interpolated' is a straight line drawn between two readings that
 * may be hours apart -- it is a guess, so a leg with an interpolated or absent endpoint is NULL with
 * that reason. Measured live 2026-10-01: since 09-15, only 13 fuel-stop entries and 14 exits are
 * real_obd; ~580 are interpolated. That is the honest denominator.
 *
 * SECOND SIGNAL: Samsara HOS daily logs (driver-day driveDistanceMeters), independent of the
 * odometer. A leg longer than the driver's HOS drive distance over the days it spans is flagged.
 */
import { driverAtTimeSql } from "../maintenance/driver-attribution.js";
import type { SamsaraHosDailyLog } from "../integrations/samsara/samsara-client.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type Crossing = {
  unit_id: string;
  geofence_id: string;
  geofence_kind: string;
  label: string | null;
  event_kind: "entered" | "exited" | string;
  occurred_at: string;
  odometer_mi: number | null;
  odometer_source: "real_obd" | "interpolated" | "absent" | string;
};

export type LegNullReason =
  | "exit_odometer_interpolated"
  | "exit_odometer_absent"
  | "entry_odometer_interpolated"
  | "entry_odometer_absent"
  | "odometer_went_backwards"
  | "implausible_average_speed";

export type DrivenLeg = {
  unit_id: string;
  from_geofence_id: string;
  from_label: string | null;
  to_geofence_id: string;
  to_label: string | null;
  exited_at: string;
  entered_at: string;
  miles: number | null;
  null_reason: LegNullReason | null;
};

/** Above this average speed between two stops the odometer pair is not a real drive (ECU swap, reset). */
export const MAX_PLAUSIBLE_AVG_MPH = 85;

function endpointReason(side: "exit" | "entry", source: string, odometer: number | null): LegNullReason | null {
  if (source === "real_obd" && odometer != null && Number.isFinite(odometer)) return null;
  if (source === "interpolated") return side === "exit" ? "exit_odometer_interpolated" : "entry_odometer_interpolated";
  return side === "exit" ? "exit_odometer_absent" : "entry_odometer_absent";
}

/** Pure. Crossings for ANY number of units, any order; legs come back per unit in time order. */
export function buildLegs(crossings: Crossing[]): DrivenLeg[] {
  const byUnit = new Map<string, Crossing[]>();
  for (const c of crossings) {
    const list = byUnit.get(c.unit_id) ?? [];
    list.push(c);
    byUnit.set(c.unit_id, list);
  }
  const legs: DrivenLeg[] = [];
  for (const list of byUnit.values()) {
    list.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    let lastExit: Crossing | null = null;
    for (const c of list) {
      if (c.event_kind === "exited") {
        lastExit = c;
        continue;
      }
      if (c.event_kind !== "entered" || !lastExit) continue;
      const exit: Crossing = lastExit;
      lastExit = null;
      const reason =
        endpointReason("exit", exit.odometer_source, exit.odometer_mi) ??
        endpointReason("entry", c.odometer_source, c.odometer_mi);
      let miles: number | null = null;
      let nullReason: LegNullReason | null = reason;
      if (!reason) {
        const delta = Number(c.odometer_mi) - Number(exit.odometer_mi);
        const hours = (new Date(c.occurred_at).getTime() - new Date(exit.occurred_at).getTime()) / 3_600_000;
        if (delta < 0) nullReason = "odometer_went_backwards";
        else if (hours > 0 && delta / hours > MAX_PLAUSIBLE_AVG_MPH) nullReason = "implausible_average_speed";
        else miles = Math.round(delta * 10) / 10;
      }
      legs.push({
        unit_id: c.unit_id,
        from_geofence_id: exit.geofence_id,
        from_label: exit.label,
        to_geofence_id: c.geofence_id,
        to_label: c.label,
        exited_at: exit.occurred_at,
        entered_at: c.occurred_at,
        miles,
        null_reason: nullReason,
      });
    }
  }
  return legs;
}

export type HosCrossCheck =
  | { status: "ok"; driver_id: string; hos_drive_miles: number; exceeds_hos: boolean }
  | { status: "no_driver_at_time" | "driver_not_mapped_to_samsara" | "no_hos_log_for_window" | "leg_miles_null" };

const METERS_PER_MILE = 1609.344;

/** Pure. HOS miles over every daily log that overlaps the leg window, for that driver. */
export function crossCheckLeg(
  leg: DrivenLeg,
  driver: { driver_id: string | null; samsara_driver_id: string | null },
  logs: SamsaraHosDailyLog[]
): HosCrossCheck {
  if (leg.miles == null) return { status: "leg_miles_null" };
  if (!driver.driver_id) return { status: "no_driver_at_time" };
  if (!driver.samsara_driver_id) return { status: "driver_not_mapped_to_samsara" };
  const from = new Date(leg.exited_at).getTime();
  const to = new Date(leg.entered_at).getTime();
  const overlapping = logs.filter(
    (l) => l.samsara_driver_id === driver.samsara_driver_id && new Date(l.start_time).getTime() < to && new Date(l.end_time).getTime() > from && l.drive_distance_meters != null
  );
  if (overlapping.length === 0) return { status: "no_hos_log_for_window" };
  const hosMiles = overlapping.reduce((s, l) => s + Number(l.drive_distance_meters), 0) / METERS_PER_MILE;
  return {
    status: "ok",
    driver_id: driver.driver_id,
    hos_drive_miles: Math.round(hosMiles * 10) / 10,
    exceeds_hos: leg.miles > hosMiles * 1.05 + 2,
  };
}

export async function loadCrossings(client: Db, operatingCompanyId: string, fromIso: string, toIso: string): Promise<Crossing[]> {
  const res = await client.query<Crossing>(
    `SELECT c.unit_id::text, c.geofence_id::text, c.geofence_kind, g.label, c.event_kind,
            c.occurred_at::text, c.odometer_mi::float8 AS odometer_mi, c.odometer_source
       FROM telematics.geofence_odometer_captures c
       LEFT JOIN geo.geofences g ON g.id = c.geofence_id AND g.operating_company_id = c.operating_company_id
       JOIN mdata.units u ON u.id = c.unit_id AND COALESCE(u.is_sample_data, false) = false
      WHERE c.operating_company_id = $1::uuid
        AND c.occurred_at >= $2::timestamptz AND c.occurred_at < $3::timestamptz
      ORDER BY c.unit_id, c.occurred_at`,
    [operatingCompanyId, fromIso, toIso]
  );
  return res.rows;
}

/** Driver holding the unit at the moment it left the first stop -- the shared predicate, never inlined. */
export async function driverForLeg(
  client: Db,
  operatingCompanyId: string,
  leg: DrivenLeg
): Promise<{ driver_id: string | null; samsara_driver_id: string | null }> {
  const res = await client.query<{ driver_id: string | null; samsara_driver_id: string | null }>(
    // samsara_driver_id lives on mdata.drivers for most drivers; for 4 of 27 live USMCA drivers it
    // exists only in the integrations.samsara_drivers mirror -- use either, never guess.
    `SELECT driver_at_time.driver_id::text,
            COALESCE(d.samsara_driver_id,
                     (SELECT sd.samsara_driver_id FROM integrations.samsara_drivers sd
                       WHERE sd.local_driver_id = driver_at_time.driver_id AND sd.operating_company_id = $1::uuid
                       ORDER BY sd.last_seen_at DESC NULLS LAST LIMIT 1)) AS samsara_driver_id
       FROM (SELECT 1) _one
       ${driverAtTimeSql("$2::uuid", "$3::timestamptz")}
       LEFT JOIN mdata.drivers d ON d.id = driver_at_time.driver_id`,
    [operatingCompanyId, leg.unit_id, leg.exited_at]
  );
  return res.rows[0] ?? { driver_id: null, samsara_driver_id: null };
}

export type LegReport = {
  window: { from: string; to: string };
  legs: Array<DrivenLeg & { driver_id: string | null; hos: HosCrossCheck }>;
  summary: {
    legs: number;
    legs_with_miles: number;
    total_real_miles: number;
    null_by_reason: Record<string, number>;
    hos_checked: number;
    hos_exceeded: number;
    hos_unavailable_reason: string | null;
  };
};

export async function computeDrivenMilesLegs(
  client: Db,
  input: { operatingCompanyId: string; fromIso: string; toIso: string; fetchHosLogs: () => Promise<SamsaraHosDailyLog[]> }
): Promise<LegReport> {
  const crossings = await loadCrossings(client, input.operatingCompanyId, input.fromIso, input.toIso);
  const legs = buildLegs(crossings);
  let logs: SamsaraHosDailyLog[] = [];
  let hosUnavailable: string | null = null;
  try {
    logs = await input.fetchHosLogs();
  } catch (error) {
    hosUnavailable = String((error as Error)?.message ?? error).slice(0, 200);
  }
  const out: LegReport["legs"] = [];
  const nullByReason: Record<string, number> = {};
  let hosChecked = 0;
  let hosExceeded = 0;
  for (const leg of legs) {
    if (leg.null_reason) nullByReason[leg.null_reason] = (nullByReason[leg.null_reason] ?? 0) + 1;
    const driver = await driverForLeg(client, input.operatingCompanyId, leg);
    const hos = hosUnavailable ? ({ status: "no_hos_log_for_window" } as HosCrossCheck) : crossCheckLeg(leg, driver, logs);
    if (hos.status === "ok") {
      hosChecked += 1;
      if (hos.exceeds_hos) hosExceeded += 1;
    }
    out.push({ ...leg, driver_id: driver.driver_id, hos });
  }
  const withMiles = out.filter((l) => l.miles != null);
  return {
    window: { from: input.fromIso, to: input.toIso },
    legs: out,
    summary: {
      legs: out.length,
      legs_with_miles: withMiles.length,
      total_real_miles: Math.round(withMiles.reduce((s, l) => s + Number(l.miles), 0) * 10) / 10,
      null_by_reason: nullByReason,
      hos_checked: hosChecked,
      hos_exceeded: hosExceeded,
      hos_unavailable_reason: hosUnavailable,
    },
  };
}
