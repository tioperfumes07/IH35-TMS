/**
 * ROUND 305 B-47 — the fuel component of the driver integrity score, built so it REFUSES to flag
 * a driver on a single signal.
 *
 * Owner's standard, verbatim via the Lead: "two independent signals agreeing is a finding, one
 * alone is a suspicion." Independence is decided by EVIDENCE SOURCE, not by signal name: two
 * signals are independent only when they share no measured input. The two MPG signals both divide
 * by the same fuel-card gallons, so they corroborate each other's miles but can never, together,
 * make a finding — a bad gallons figure would move both at once.
 *
 * Signals (each carries its sources, its arithmetic in words, and row-level evidence — B-50):
 *   mpg_odometer_snapshot  B-28's MPG: fuel-card gallons / miles from the daily odometer snapshot.
 *   mpg_stop_odometer      fuel-card gallons / miles from stop-odometer-capture (odometer deltas
 *                          between stops, attributed to the driver holding the truck at both ends).
 *   relay_fill_presence    every Relay fill (real pump time + station lat/lng) checked against the
 *                          truck's own GPS: was it stopped within PRESENCE_RADIUS_M of the pump at
 *                          that time? Shares nothing with the MPG signals.
 *   samsara_fuel_energy    Samsara's Fuel & Energy report — CC-3's T-50. Reported unavailable
 *                          until that feed exists; never faked.
 *
 * What this engine will not do: estimate miles across a gap, split a segment that straddles a
 * driver handover, call a fill "absent" when the truck had no GPS at all, or compute MPG from a
 * fill with no gallons. Each of those is counted and stated instead.
 */
import {
  computeDriverFuelScorecard,
  FLEET_MPG_SD_THRESHOLD,
  type DriverFuelScorecardRow,
} from "./fuel-driver-scorecard.service.js";
import {
  driverAtTimeFromWindows,
  unitAssignmentWindowsSql,
  type AssignmentWindow,
} from "./driver-attribution.js";
import {
  attachNearestOdometer,
  detectStops,
  milesBetweenStops,
  unitFixesSql,
  type PositionFix,
} from "../telematics/stop-odometer-capture.service.js";
import { classifyFleetUnit, fleetUnitFactsSql } from "../telematics/live-fleet.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Truck must be stopped within this many metres of the pump to count as present. */
export const PRESENCE_RADIUS_M = 500;
/** Window either side of the Relay pump time searched for the truck's own GPS. */
export const PRESENCE_WINDOW_MINUTES = 60;
/** Absent fills needed before the presence signal reads anomalous. One alone can be GPS drift. */
export const PRESENCE_ABSENT_MIN = 2;
/** Stop-odometer must cover this share of a driver's assigned hours, or its MPG is withheld. */
export const STOP_MILES_MIN_COVERAGE = 0.8;

export type SignalVerdict = "anomalous" | "normal" | "unavailable";

export type FuelSignal = {
  signal: "mpg_odometer_snapshot" | "mpg_stop_odometer" | "relay_fill_presence" | "samsara_fuel_energy";
  sources: string[];
  verdict: SignalVerdict;
  /** The arithmetic in words, with the real numbers substituted. Never empty. */
  arithmetic: string;
  /** Why the verdict is what it is, including why a signal is unavailable. Never empty. */
  reason: string;
  evidence: unknown[];
};

export type FuelIntegrityResult = {
  rows: DriverFuelIntegrity[];
  /** Relay fills that could not reach any driver — counted, never silently dropped. */
  coverage: { relay_fills_in_period: number; relay_fills_no_unit_or_location: number; relay_fills_no_driver_at_pump_time: number };
};

export type FuelIntegrityStatus = "finding" | "suspicion" | "clear" | "insufficient_data";

export type DriverFuelIntegrity = {
  driver_id: string;
  period_start: string;
  period_end: string;
  status: FuelIntegrityStatus;
  /** Plain words: which signals agreed, or why this is not a finding. */
  basis: string;
  signals: FuelSignal[];
};

function sharesSource(a: FuelSignal, b: FuelSignal): boolean {
  return a.sources.some((s) => b.sources.includes(s));
}

/**
 * The decision, pure. A finding needs two ANOMALOUS signals with disjoint sources. Exported so the
 * guard proves the refusal without a database.
 */
export function decideFuelIntegrity(signals: FuelSignal[]): { status: FuelIntegrityStatus; basis: string } {
  const anomalous = signals.filter((s) => s.verdict === "anomalous");
  const available = signals.filter((s) => s.verdict !== "unavailable");
  for (let i = 0; i < anomalous.length; i++) {
    for (let j = i + 1; j < anomalous.length; j++) {
      if (!sharesSource(anomalous[i], anomalous[j])) {
        return {
          status: "finding",
          basis: `${anomalous[i].signal} and ${anomalous[j].signal} both anomalous, from independent sources (${anomalous[i].sources.join("+")} vs ${anomalous[j].sources.join("+")})`,
        };
      }
    }
  }
  if (anomalous.length > 0) {
    const names = anomalous.map((s) => s.signal).join(", ");
    return {
      status: "suspicion",
      basis:
        anomalous.length === 1
          ? `only ${names} is anomalous — one signal is a suspicion, never a finding`
          : `${names} are anomalous but share an input (${anomalous[0].sources.filter((s) => anomalous.every((a) => a.sources.includes(s))).join(", ")}) — not independent, so still a suspicion`,
    };
  }
  if (available.length === 0) {
    return { status: "insufficient_data", basis: "no fuel signal has enough data for this driver in this period" };
  }
  return { status: "clear", basis: `${available.map((s) => s.signal).join(", ")} available and normal` };
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

type FixRow = {
  captured_at: Date;
  lat: string | null;
  lng: string | null;
  speed_mph: string | null;
  engine_state: string | null;
  odometer_mi: string | null;
  city: string | null;
  state: string | null;
};

function toFix(r: FixRow): PositionFix {
  const n = (v: string | null) => (v === null ? null : Number(v));
  return {
    capturedAt: new Date(r.captured_at),
    lat: n(r.lat),
    lng: n(r.lng),
    speedMph: n(r.speed_mph),
    engineState: r.engine_state,
    odometerMi: n(r.odometer_mi),
    city: r.city,
    state: r.state,
  };
}

type UnitData = { unitId: string; unitNumber: string; fixes: PositionFix[]; windows: AssignmentWindow[] };

/** Per-driver stop-odometer miles and the assigned hours they cover. */
type StopMiles = { miles: number; coveredHours: number; segments: number; handoverExcluded: number; backwardsExcluded: number };

function stopMilesByDriver(units: UnitData[]): Map<string, StopMiles> {
  const out = new Map<string, StopMiles>();
  const get = (d: string) => {
    let v = out.get(d);
    if (!v) {
      v = { miles: 0, coveredHours: 0, segments: 0, handoverExcluded: 0, backwardsExcluded: 0 };
      out.set(d, v);
    }
    return v;
  };
  for (const u of units) {
    const odoFixes = u.fixes.filter((f) => f.odometerMi !== null);
    const stops = detectStops(u.unitId, u.fixes).map((s) => attachNearestOdometer(s, odoFixes));
    const withMiles = milesBetweenStops(stops);
    let prevOdoStop: (typeof withMiles)[number] | null = null;
    for (const s of withMiles) {
      if (s.odometerMi === null) continue;
      if (prevOdoStop !== null) {
        const dPrev = driverAtTimeFromWindows(u.windows, prevOdoStop.startedAt);
        const dCur = driverAtTimeFromWindows(u.windows, s.startedAt);
        if (s.milesSincePreviousStop === null) {
          if (dCur) get(dCur).backwardsExcluded += 1;
        } else if (dPrev !== null && dPrev === dCur) {
          const agg = get(dCur);
          agg.miles += s.milesSincePreviousStop;
          agg.coveredHours += (s.startedAt.getTime() - prevOdoStop.startedAt.getTime()) / 3_600_000;
          agg.segments += 1;
        } else if (dPrev !== null || dCur !== null) {
          // Straddles a handover (or an unassigned end): never split, never guessed.
          if (dCur) get(dCur).handoverExcluded += 1;
          if (dPrev && dPrev !== dCur) get(dPrev).handoverExcluded += 1;
        }
      }
      prevOdoStop = s;
    }
  }
  return out;
}

function assignedHoursByDriver(units: UnitData[], start: Date, end: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const u of units) {
    for (const w of u.windows) {
      const s = Math.max(w.startedAt.getTime(), start.getTime());
      const e = Math.min((w.endedAt ?? end).getTime(), end.getTime());
      if (e > s) out.set(w.driverId, (out.get(w.driverId) ?? 0) + (e - s) / 3_600_000);
    }
  }
  return out;
}

type RelayFillRow = {
  id: string;
  transaction_id: string;
  unit_id: string | null;
  relay_created_at: Date;
  lat: string | null;
  lng: string | null;
  merchant_name: string | null;
  location_city: string | null;
  location_state: string | null;
  relay_driver_name: string | null;
  gallons: string | null;
  total_amount_paid_cents: string;
};

type PresenceOutcome = {
  transaction_id: string;
  unit_number: string;
  pump_time: string;
  station: string;
  gallons: number | null;
  amount_paid_cents: number;
  relay_reported_driver: string | null;
  outcome: "present" | "absent" | "unverifiable";
  nearest_stopped_fix_metres: number | null;
  nearest_stopped_fix_at: string | null;
  note: string;
};

function checkPresence(fill: RelayFillRow, unit: UnitData): PresenceOutcome {
  const t = new Date(fill.relay_created_at).getTime();
  const winMs = PRESENCE_WINDOW_MINUTES * 60_000;
  const nearby = unit.fixes.filter((f) => Math.abs(f.capturedAt.getTime() - t) <= winMs && f.lat !== null && f.lng !== null);
  const base = {
    transaction_id: fill.transaction_id,
    unit_number: unit.unitNumber,
    pump_time: new Date(fill.relay_created_at).toISOString(),
    station: [fill.merchant_name, fill.location_city, fill.location_state].filter(Boolean).join(", "),
    gallons: fill.gallons === null ? null : Number(fill.gallons),
    amount_paid_cents: Number(fill.total_amount_paid_cents),
    relay_reported_driver: fill.relay_driver_name,
  };
  if (nearby.length === 0) {
    return {
      ...base,
      outcome: "unverifiable",
      nearest_stopped_fix_metres: null,
      nearest_stopped_fix_at: null,
      note: `truck had no GPS fix within ${PRESENCE_WINDOW_MINUTES} min of pump time — cannot say where it was, so NOT counted against the driver`,
    };
  }
  const stopped = nearby.filter((f) => (f.speedMph !== null ? f.speedMph <= 1 : f.engineState === "off"));
  let best: { m: number; at: Date } | null = null;
  for (const f of stopped) {
    const m = haversineMetres(Number(fill.lat), Number(fill.lng), f.lat as number, f.lng as number);
    if (best === null || m < best.m) best = { m, at: f.capturedAt };
  }
  if (best !== null && best.m <= PRESENCE_RADIUS_M) {
    return {
      ...base,
      outcome: "present",
      nearest_stopped_fix_metres: Math.round(best.m),
      nearest_stopped_fix_at: best.at.toISOString(),
      note: `truck stopped ${Math.round(best.m)} m from the pump`,
    };
  }
  return {
    ...base,
    outcome: "absent",
    nearest_stopped_fix_metres: best === null ? null : Math.round(best.m),
    nearest_stopped_fix_at: best === null ? null : best.at.toISOString(),
    note:
      best === null
        ? `truck had ${nearby.length} GPS fixes within ${PRESENCE_WINDOW_MINUTES} min of pump time and was MOVING in every one`
        : `nearest point the truck was stopped is ${(best.m / 1609.344).toFixed(1)} mi from the pump — card used where this truck was not`,
  };
}

function mpgFleetFloor(values: number[]): { mean: number; sd: number; floor: number } | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  if (sd === 0) return null;
  return { mean, sd, floor: mean - FLEET_MPG_SD_THRESHOLD * sd };
}

const SNAPSHOT_SOURCES = ["fuel_card_gallons", "odometer_daily_snapshot"];
const STOP_SOURCES = ["fuel_card_gallons", "stop_odometer_capture"];
const PRESENCE_SOURCES = ["relay_pump_location", "unit_gps_positions"];
const SAMSARA_SOURCES = ["samsara_fuel_energy"];

export async function computeDriverFuelIntegrity(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<FuelIntegrityResult> {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const pad = PRESENCE_WINDOW_MINUTES * 60_000;

  // Sequential on one client by design — concurrent queries on a single pg client are deprecated.
  const scorecard = await computeDriverFuelScorecard(client, operatingCompanyId, periodStart, periodEnd);

  const factsRes = await client.query<{
    unit_id: string;
    unit_number: string;
    is_sample_data: boolean;
    last_gps_at: Date | null;
    ever_had_odometer: boolean;
  }>(fleetUnitFactsSql(), [operatingCompanyId]);
  const now = new Date();
  const realUnits = factsRes.rows
    .map((r) =>
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
    .filter((u) => u.fleetClass === "reporting" || u.fleetClass === "dark");

  const units: UnitData[] = [];
  for (const u of realUnits) {
    const fixesRes = await client.query<FixRow>(unitFixesSql(), [
      u.unitId,
      new Date(start.getTime() - pad).toISOString(),
      new Date(end.getTime() + pad).toISOString(),
    ]);
    if (fixesRes.rows.length === 0) continue;
    const winRes = await client.query<{ driver_id: string; started_at: Date; ended_at: Date | null; created_at: Date }>(
      unitAssignmentWindowsSql(),
      [operatingCompanyId, u.unitId]
    );
    units.push({
      unitId: u.unitId,
      unitNumber: u.unitNumber,
      fixes: fixesRes.rows.map(toFix),
      windows: winRes.rows.map((w) => ({
        driverId: w.driver_id,
        startedAt: new Date(w.started_at),
        endedAt: w.ended_at ? new Date(w.ended_at) : null,
        createdAt: new Date(w.created_at),
      })),
    });
  }
  const unitById = new Map(units.map((u) => [u.unitId, u]));

  const stopMiles = stopMilesByDriver(units);
  const assignedHours = assignedHoursByDriver(units, start, end);

  const relayRes = await client.query<RelayFillRow>(
    `
    SELECT r.id::text AS id, r.transaction_id, r.matched_unit_id::text AS unit_id, r.relay_created_at,
           r.location_latitude::text AS lat, r.location_longitude::text AS lng,
           r.merchant_name, r.location_city, r.location_state,
           NULLIF(trim(concat_ws(' ', r.relay_driver_first_name, r.relay_driver_last_name)), '') AS relay_driver_name,
           (SELECT sum(l.volume)::text FROM integrations.relay_fuel_transaction_lines l
             WHERE l.relay_fuel_transaction_id = r.id AND l.is_active AND l.volume_uom = 'gallons') AS gallons,
           r.total_amount_paid_cents::text AS total_amount_paid_cents
      FROM integrations.relay_fuel_transactions r
     WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
       AND r.relay_created_at >= $2::timestamptz AND r.relay_created_at < $3::timestamptz
     ORDER BY r.relay_created_at`,
    [operatingCompanyId, periodStart, periodEnd]
  );
  const presenceByDriver = new Map<string, PresenceOutcome[]>();
  let relayNoUnitOrPlace = 0;
  let relayNoDriver = 0;
  for (const fill of relayRes.rows) {
    const unit = fill.unit_id ? unitById.get(fill.unit_id) : undefined;
    if (!unit || fill.lat === null || fill.lng === null) {
      relayNoUnitOrPlace += 1;
      continue;
    }
    const driverId = driverAtTimeFromWindows(unit.windows, new Date(fill.relay_created_at));
    if (!driverId) {
      relayNoDriver += 1;
      continue;
    }
    const list = presenceByDriver.get(driverId) ?? [];
    list.push(checkPresence(fill, unit));
    presenceByDriver.set(driverId, list);
  }

  // Fleet floor for the stop-odometer MPG, built the same way B-28 builds its own.
  const scoreByDriver = new Map<string, DriverFuelScorecardRow>(scorecard.map((r) => [r.driver_id, r]));
  const stopMpg = new Map<string, number>();
  for (const [driverId, sm] of stopMiles) {
    const sc = scoreByDriver.get(driverId);
    const cov = sm.coveredHours / (assignedHours.get(driverId) ?? Infinity);
    if (sc && sc.gallons > 0 && sm.miles > 0 && cov >= STOP_MILES_MIN_COVERAGE) stopMpg.set(driverId, sm.miles / sc.gallons);
  }
  const stopFloor = mpgFleetFloor([...stopMpg.values()]);

  const driverIds = new Set<string>([...scoreByDriver.keys(), ...stopMiles.keys(), ...presenceByDriver.keys()]);
  const out: DriverFuelIntegrity[] = [];
  for (const driverId of [...driverIds].sort()) {
    const sc = scoreByDriver.get(driverId) ?? null;
    const signals: FuelSignal[] = [];

    // 1 — B-28's own MPG, unchanged; its flag is the verdict.
    const snapFlag = sc?.flags.find((f) => f.kind === "mpg_below_fleet_floor");
    signals.push(
      sc === null || sc.mpg === null
        ? {
            signal: "mpg_odometer_snapshot",
            sources: SNAPSHOT_SOURCES,
            verdict: "unavailable",
            arithmetic: "MPG = fuel-card gallons / daily-snapshot odometer miles — not computable",
            reason:
              sc === null
                ? "no fuel-card fills attributed to this driver in the period"
                : sc.mpg_null_reason === "odometer_gap"
                  ? "an assignment window lacks a boundary odometer reading — MPG withheld, never estimated (B-28)"
                  : "no gallons or no miles in the period",
            evidence: [],
          }
        : {
            signal: "mpg_odometer_snapshot",
            sources: SNAPSHOT_SOURCES,
            verdict: snapFlag ? "anomalous" : "normal",
            arithmetic: `${sc.miles_driven} mi / ${sc.gallons} gal = ${sc.mpg} MPG` +
              (snapFlag && snapFlag.kind === "mpg_below_fleet_floor"
                ? `; fleet ${snapFlag.fleet_mean_mpg} - ${FLEET_MPG_SD_THRESHOLD} x ${snapFlag.fleet_sd_mpg} SD = floor ${snapFlag.threshold_mpg}`
                : ""),
            reason: snapFlag ? "MPG below the fleet floor" : "MPG at or above the fleet floor (or no fleet floor yet)",
            evidence: [{ fills: sc.fill_count, gallons: sc.gallons, miles: sc.miles_driven, cost_cents: sc.total_cost_cents }],
          }
    );

    // 2 — same gallons, independent miles.
    const sm = stopMiles.get(driverId);
    const hours = assignedHours.get(driverId) ?? 0;
    const cov = sm && hours > 0 ? sm.coveredHours / hours : 0;
    const mpg2 = stopMpg.get(driverId) ?? null;
    if (mpg2 === null) {
      signals.push({
        signal: "mpg_stop_odometer",
        sources: STOP_SOURCES,
        verdict: "unavailable",
        arithmetic: "MPG = fuel-card gallons / stop-odometer miles — not computable",
        reason: !sm
          ? "no stop-to-stop odometer segment attributable to this driver in the period"
          : !sc || sc.gallons <= 0
            ? `stop-odometer measured ${sm.miles.toFixed(1)} mi but no fuel-card gallons are attributed to this driver — NO MPG WITHOUT GALLONS`
            : `stop-odometer covers ${(cov * 100).toFixed(0)}% of the driver's ${hours.toFixed(0)} assigned hours, under the ${STOP_MILES_MIN_COVERAGE * 100}% needed — partial miles would understate MPG`,
        evidence: sm ? [{ miles: Number(sm.miles.toFixed(1)), segments: sm.segments, handover_segments_excluded: sm.handoverExcluded, backwards_odometer_excluded: sm.backwardsExcluded, covered_hours: Number(sm.coveredHours.toFixed(1)), assigned_hours: Number(hours.toFixed(1)) }] : [],
      });
    } else {
      const low = stopFloor !== null && mpg2 < stopFloor.floor;
      signals.push({
        signal: "mpg_stop_odometer",
        sources: STOP_SOURCES,
        verdict: stopFloor === null ? "unavailable" : low ? "anomalous" : "normal",
        arithmetic:
          `${sm!.miles.toFixed(1)} mi / ${sc!.gallons} gal = ${mpg2.toFixed(2)} MPG` +
          (stopFloor ? `; fleet ${stopFloor.mean.toFixed(2)} - ${FLEET_MPG_SD_THRESHOLD} x ${stopFloor.sd.toFixed(2)} SD = floor ${stopFloor.floor.toFixed(2)}` : ""),
        reason: stopFloor === null ? "fewer than two drivers with a computable stop-odometer MPG — no fleet floor to compare against" : low ? "MPG below the fleet floor" : "MPG at or above the fleet floor",
        evidence: [{ miles: Number(sm!.miles.toFixed(1)), segments: sm!.segments, handover_segments_excluded: sm!.handoverExcluded, backwards_odometer_excluded: sm!.backwardsExcluded, coverage_pct: Number((cov * 100).toFixed(0)) }],
      });
    }

    // 3 — was the truck at the pump.
    const fills = presenceByDriver.get(driverId) ?? [];
    const absent = fills.filter((f) => f.outcome === "absent");
    const checkable = fills.filter((f) => f.outcome !== "unverifiable");
    signals.push({
      signal: "relay_fill_presence",
      sources: PRESENCE_SOURCES,
      verdict: checkable.length === 0 ? "unavailable" : absent.length >= PRESENCE_ABSENT_MIN ? "anomalous" : "normal",
      arithmetic: `${absent.length} absent of ${checkable.length} checkable Relay fills (${fills.length - checkable.length} unverifiable); anomalous at >= ${PRESENCE_ABSENT_MIN} absent`,
      reason:
        checkable.length === 0
          ? fills.length === 0
            ? "no Relay fills attributed to this driver in the period"
            : "every Relay fill fell in a GPS gap — nothing to check against"
          : absent.length >= PRESENCE_ABSENT_MIN
            ? `${absent.length} fills where the truck was not stopped within ${PRESENCE_RADIUS_M} m of the pump`
            : absent.length === 1
              ? "one absent fill — below threshold, can be GPS drift; listed as evidence, not counted as anomalous"
              : `truck present at every checkable fill`,
      evidence: fills,
    });

    // 4 — CC-3 T-50.
    signals.push({
      signal: "samsara_fuel_energy",
      sources: SAMSARA_SOURCES,
      verdict: "unavailable",
      arithmetic: "Samsara-reported fuel used vs fuel bought — not computable",
      reason: "Samsara Fuel & Energy feed is CC-3's T-50 and does not exist yet; reported as unavailable, never faked",
      evidence: [],
    });

    const decision = decideFuelIntegrity(signals);
    out.push({ driver_id: driverId, period_start: periodStart, period_end: periodEnd, ...decision, signals });
  }
  return {
    rows: out,
    coverage: {
      relay_fills_in_period: relayRes.rows.length,
      relay_fills_no_unit_or_location: relayNoUnitOrPlace,
      relay_fills_no_driver_at_pump_time: relayNoDriver,
    },
  };
}
