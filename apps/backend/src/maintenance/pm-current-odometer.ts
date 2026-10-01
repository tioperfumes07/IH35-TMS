/**
 * ROUND 305 A-46 -- PM due fed from the Lead's stop-odometer engine
 * (apps/backend/src/telematics/stop-odometer-capture.service.ts). That engine is reused unchanged;
 * this file only fetches a unit's recent fixes, runs it, and decides which READ odometer is current.
 *
 * Measured 2026-10-01 before wiring: the PM auto-WO cron skipped 41 unit-runs as no-odometer in
 * 7 days, because vehicle_latest_position only holds the LAST fix and only 2,140 of 9,559 position
 * instants in 48 h (22 %) carry an odometer. Replaying each skip at its own timestamp, 19 of the 41
 * had an odometer read at a stop in the prior 48 h -- every skip of every reporting truck. The other
 * 22 (dark units, and stretches where the odometer feed itself sent nothing) stay skipped: there is
 * no read to recover. The T-29 engine read a ledger ~6 h stale (one row per unit per day),
 * understating miles by up to 323 mi (T174). Stop capture and the ledger are the same Samsara stat
 * (obdOdometerMeters): snapshot vs vehicle_locations at the same instant differed by 0.0 mi on every
 * sample.
 *
 * Rules carried over from the engine, not relaxed: an odometer is READ or ABSENT, never interpolated,
 * and a reading LOWER than an older real reading is a negative delta -- HELD, not used.
 */
import {
  attachNearestOdometer,
  detectStops,
  unitFixesSql,
  type PositionFix,
} from "../telematics/stop-odometer-capture.service.js";

export const STOP_ODOMETER_LOOKBACK_HOURS = 48;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type OdometerSource =
  | "vehicle_latest_position"
  | "odometer_readings"
  | "stop_capture"
  | "samsara_raw_payload";

export type OdometerReading = {
  odometer_miles: number;
  read_at: string;
  source: OdometerSource;
};

export type ChosenOdometer = {
  odometer_miles: number | null;
  read_at: string | null;
  source: OdometerSource | null;
  /** Names every newer reading that was held for going backwards, or null when none was. */
  held_note: string | null;
};

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

/**
 * The odometer at the unit's most recent stop (>= STOP_MIN_DWELL_MINUTES) in the lookback window,
 * read inside the stop or attached from the nearest fix within the engine's own tolerance. Null when
 * no stop in the window carries one -- never a value from a moving fix, never interpolated.
 */
export async function latestStopCapturedOdometer(
  client: DbClient,
  unitId: string,
  now: Date = new Date()
): Promise<OdometerReading | null> {
  const from = new Date(now.getTime() - STOP_ODOMETER_LOOKBACK_HOURS * 3_600_000);
  const res = await client.query<FixRow>(unitFixesSql(), [unitId, from.toISOString(), now.toISOString()]);
  const fixes = res.rows.map(toFix);
  const candidates = fixes.filter((f) => f.odometerMi !== null);
  const stops = detectStops(unitId, fixes).map((s) => attachNearestOdometer(s, candidates));
  for (let i = stops.length - 1; i >= 0; i -= 1) {
    const s = stops[i]!;
    if (s.odometerMi !== null && s.odometerReadAt !== null) {
      return { odometer_miles: s.odometerMi, read_at: s.odometerReadAt.toISOString(), source: "stop_capture" };
    }
  }
  return null;
}

/**
 * The newest real reading is current -- unless an OLDER real reading is higher, in which case the
 * newer one went backwards and is held. The next-newest reading that no older reading exceeds stands.
 * Pure: no DB, no clock.
 */
export function chooseCurrentOdometer(candidates: Array<OdometerReading | null | undefined>): ChosenOdometer {
  const real = candidates
    .filter((c): c is OdometerReading => c != null && Number.isFinite(c.odometer_miles))
    .filter((c) => !Number.isNaN(new Date(c.read_at).getTime()))
    .sort((a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime());

  const held: string[] = [];
  for (let i = 0; i < real.length; i += 1) {
    const c = real[i]!;
    const older = real.slice(i + 1);
    const higherOlder = older.find((o) => o.odometer_miles > c.odometer_miles);
    if (!higherOlder) {
      return {
        odometer_miles: c.odometer_miles,
        read_at: c.read_at,
        source: c.source,
        held_note: held.length > 0 ? held.join("; ") : null,
      };
    }
    held.push(
      `${c.source} ${c.odometer_miles} mi at ${c.read_at} is BELOW ${higherOlder.source} ` +
        `${higherOlder.odometer_miles} mi at ${higherOlder.read_at} -- negative delta held, not used`
    );
  }
  return { odometer_miles: null, read_at: null, source: null, held_note: held.length > 0 ? held.join("; ") : null };
}
