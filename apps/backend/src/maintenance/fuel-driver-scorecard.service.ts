/**
 * B-28 — fuel / MPG per driver (Lead order, ROUND 297.3).
 *
 * Owner, verbatim: "the engine is supposed to let us know based on mpg, etc if a driver is
 * consuming too much fuel, he might steal and sell." Every flag here is evidence to look at, not
 * an accusation — stated plainly in the payload itself.
 *
 * Attribution: fuel.fuel_transactions.driver_id is NEVER trusted directly — it is exactly the
 * kind of manually-stamped column that goes stale the moment a truck changes hands (the owner's
 * own framing for why this whole engine exists). Every fill is attributed via
 * driverAtTimeSql (B-27) against the unit + transaction_at.
 *
 * Miles: never estimated. A driver's assignment window contributes miles only when BOTH a start
 * and an end odometer reading exist within ±24h of the window's boundary
 * (telematics.odometer_readings, CC-3's ROUND 297.1 ledger). If ANY of a driver's windows in the
 * period is missing either boundary reading, that driver's whole-period MPG is NULL with
 * reason='odometer_gap' — a partial computation would understate real miles and make a driver
 * look worse (or better) than the data actually supports, which is the opposite of "evidence, not
 * accusation."
 */
import { driverAtTimeSql, computeDriverMilesInPeriod } from "./driver-attribution.js";
import { fuelPurchaseIneligibleReason, type FuelPurchaseIneligibleReason } from "../fuel/fuel-purchase-eligibility.js";
import { evaluateTankOverflow, haversineMiles, DEFAULT_TANK_CAPACITY_GAL, type FuelTransactionContext } from "../integrations/fuel/fraud-detector/rules.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const FLEET_MPG_SD_THRESHOLD = 1.5;
export const RAPID_REFUEL_WINDOW_MINUTES = 90;
export const RAPID_REFUEL_DISTANCE_MILES = 50;

export type FuelAnomalyFlag =
  | { kind: "mpg_below_fleet_floor"; driver_mpg: number; fleet_mean_mpg: number; fleet_sd_mpg: number; threshold_mpg: number }
  | { kind: "tank_overflow"; fuel_transaction_id: string; gallons: number; tank_capacity_gal: number; transaction_at: string }
  | {
      kind: "impossible_distance_refuel";
      fuel_transaction_id_a: string;
      fuel_transaction_id_b: string;
      minutes_apart: number;
      miles_apart: number;
      transaction_at_a: string;
      transaction_at_b: string;
    }
  | { kind: "gallons_exceed_worst_case_consumption"; gallons_bought: number; miles_driven: number; fleet_worst_mpg: number; max_plausible_gallons: number };

/** ROUND 305 B-50: one fill, as a reviewer needs to see it — never just an id. */
export type FillEvidence = {
  fuel_transaction_id: string;
  transaction_at: string;
  gallons: number | null;
  total_cost_cents: number | null;
  unit_id: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  location: string | null;
};

/** ROUND 305 B-50: every flag carries its evidence and its period. A flag without them is an accusation. */
export type FlagEvidence = {
  period_start: string;
  period_end: string;
  /** The arithmetic in words with the real numbers. Never empty. */
  arithmetic: string;
  evidence_fills: FillEvidence[];
};

export type EvidencedFuelFlag = FuelAnomalyFlag & FlagEvidence;

export type DriverFuelScorecardRow = {
  driver_id: string;
  period_start: string;
  period_end: string;
  gallons: number;
  total_cost_cents: number;
  miles_driven: number | null;
  mpg: number | null;
  mpg_null_reason: "odometer_gap" | null;
  gal_per_100mi: number | null;
  cost_per_mile_cents: number | null;
  fills_with_no_load: number;
  fill_count: number;
  /** Rows attributed to the driver that are not real motor-fuel purchases (fuel-purchase-eligibility.ts), by reason. */
  excluded_fill_reasons: Partial<Record<FuelPurchaseIneligibleReason, number>>;
  flags: EvidencedFuelFlag[];
};


type FuelFillRow = {
  id: string;
  driver_id: string;
  transaction_at: string;
  gallons: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_city: string | null;
  location_state: string | null;
  unit_id: string | null;
  unit_number: string | null;
  total_cost: number | null;
  vendor_name: string | null;
  fuel_type: string | null;
  load_id: string | null;
  same_stamp_count: number;
};

/** Every fill attributed to a driver in the period, for the per-driver anomaly checks (tank
 * overflow, impossible-distance-refuel) that need row-level detail, not just the aggregate. */
async function fetchDriverFillsInPeriod(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, FuelFillRow[]>> {
  const res = await client.query<FuelFillRow>(
    `
    SELECT
      ft.id::text AS id,
      dat.driver_id::text AS driver_id,
      ft.transaction_at::text AS transaction_at,
      ft.gallons::float8 AS gallons,
      ft.location_lat::float8 AS location_lat,
      ft.location_lng::float8 AS location_lng,
      ft.location_city,
      ft.location_state,
      ft.unit_id::text AS unit_id,
      u.unit_number,
      ft.total_cost::float8 AS total_cost,
      v.vendor_name,
      ft.fuel_type,
      ft.load_id::text AS load_id,
      (SELECT count(*) FROM fuel.fuel_transactions x
        WHERE x.operating_company_id = ft.operating_company_id AND x.transaction_at = ft.transaction_at
          AND x.voided_at IS NULL)::int AS same_stamp_count
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.units u ON u.id = ft.unit_id
    LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
    ${driverAtTimeSql("ft.unit_id", "ft.transaction_at", "dat")}
    WHERE ft.operating_company_id = $1::uuid
      AND ft.voided_at IS NULL
      AND ft.transaction_at >= $2::timestamptz AND ft.transaction_at < $3::timestamptz
      AND dat.driver_id IS NOT NULL
    ORDER BY dat.driver_id, ft.transaction_at ASC
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );
  const out = new Map<string, FuelFillRow[]>();
  for (const row of res.rows) {
    const list = out.get(row.driver_id) ?? [];
    list.push(row);
    out.set(row.driver_id, list);
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function fillEvidence(f: FuelFillRow): FillEvidence {
  return {
    fuel_transaction_id: f.id,
    transaction_at: f.transaction_at,
    gallons: f.gallons,
    total_cost_cents: f.total_cost == null ? null : Math.round(f.total_cost * 100),
    unit_id: f.unit_id,
    unit_number: f.unit_number,
    vendor_name: f.vendor_name,
    location: [f.location_city, f.location_state].filter(Boolean).join(", ") || null,
  };
}

export async function computeDriverFuelScorecard(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<DriverFuelScorecardRow[]> {
  // Sequential on one client — concurrent queries on a single pg client are deprecated.
  const milesByDriver = await computeDriverMilesInPeriod(client, operatingCompanyId, periodStart, periodEnd);
  const allFillsByDriver = await fetchDriverFillsInPeriod(client, operatingCompanyId, periodStart, periodEnd);

  // ROUND 306 E-19/E-21: only real motor-fuel purchases enter MPG or any fuel flag — the ONE shared
  // predicate (fuel-purchase-eligibility.ts). DEF charges, gallon-less rows and import-stamped
  // batches are excluded and counted by reason, never silently mixed into a driver's gallons.
  const fillsByDriver = new Map<string, FuelFillRow[]>();
  const excludedByDriver = new Map<string, Partial<Record<FuelPurchaseIneligibleReason, number>>>();
  const fuelByDriver = new Map<string, { gallons: number; totalCostCents: number; fillsWithNoLoad: number; fillCount: number }>();
  for (const [driverId, rows] of allFillsByDriver) {
    const eligible: FuelFillRow[] = [];
    const excluded: Partial<Record<FuelPurchaseIneligibleReason, number>> = {};
    for (const r of rows) {
      const reason = fuelPurchaseIneligibleReason(
        { fuel_type: r.fuel_type, gallons: r.gallons, transaction_at: r.transaction_at, voided_at: null, same_stamp_count: r.same_stamp_count },
        { requirePumpTime: false }
      );
      if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;
      else eligible.push(r);
    }
    fillsByDriver.set(driverId, eligible);
    excludedByDriver.set(driverId, excluded);
    fuelByDriver.set(driverId, {
      gallons: eligible.reduce((a, r) => a + (r.gallons ?? 0), 0),
      totalCostCents: eligible.reduce((a, r) => a + Math.round((r.total_cost ?? 0) * 100), 0),
      fillsWithNoLoad: eligible.filter((r) => r.load_id === null).length,
      fillCount: eligible.length,
    });
  }

  const driverIds = new Set<string>([...milesByDriver.keys(), ...fuelByDriver.keys()]);

  // First pass: compute each driver's raw mpg (where computable) to find the fleet mean/SD and
  // the fleet's own worst (lowest) MPG — both needed by the flags below.
  const mpgByDriver = new Map<string, number>();
  for (const driverId of driverIds) {
    const miles = milesByDriver.get(driverId);
    const fuel = fuelByDriver.get(driverId);
    if (miles?.miles != null && miles.miles > 0 && fuel && fuel.gallons > 0) {
      mpgByDriver.set(driverId, miles.miles / fuel.gallons);
    }
  }
  const mpgValues = [...mpgByDriver.values()];
  const fleetMeanMpg = mpgValues.length > 0 ? mean(mpgValues) : null;
  const fleetSdMpg = fleetMeanMpg != null ? stdDev(mpgValues, fleetMeanMpg) : null;
  const fleetWorstMpg = mpgValues.length > 0 ? Math.min(...mpgValues) : null;

  const rows: DriverFuelScorecardRow[] = [];
  for (const driverId of driverIds) {
    const miles = milesByDriver.get(driverId) ?? { miles: null, windowCount: 0, gapCount: 0 };
    const fuel = fuelByDriver.get(driverId) ?? { gallons: 0, totalCostCents: 0, fillsWithNoLoad: 0, fillCount: 0 };
    const fills = fillsByDriver.get(driverId) ?? [];

    const mpg = mpgByDriver.get(driverId) ?? null;
    // 'odometer_gap' is reserved for when there WAS fuel activity to explain — a driver with zero
    // fills in the period has a trivially-null MPG for lack of data, not because of a gap; without
    // this fillCount guard, a driver who simply bought no fuel would be mislabeled the same as one
    // whose real fuel purchases couldn't be matched to real miles.
    const mpgNullReason: "odometer_gap" | null = mpg == null && miles.gapCount > 0 && fuel.fillCount > 0 ? "odometer_gap" : null;

    const flags: EvidencedFuelFlag[] = [];
    const period = { period_start: periodStart, period_end: periodEnd };
    const allFills = fills.map(fillEvidence);

    // Flag 1: MPG > 1.5 SD below fleet mean.
    if (mpg != null && fleetMeanMpg != null && fleetSdMpg != null && fleetSdMpg > 0) {
      const thresholdMpg = fleetMeanMpg - FLEET_MPG_SD_THRESHOLD * fleetSdMpg;
      if (mpg < thresholdMpg) {
        flags.push({
          kind: "mpg_below_fleet_floor",
          driver_mpg: Number(mpg.toFixed(2)),
          fleet_mean_mpg: Number(fleetMeanMpg.toFixed(2)),
          fleet_sd_mpg: Number(fleetSdMpg.toFixed(2)),
          threshold_mpg: Number(thresholdMpg.toFixed(2)),
          ...period,
          arithmetic:
            `${miles.miles} mi / ${fuel.gallons.toFixed(1)} gal = ${mpg.toFixed(2)} MPG; ` +
            `fleet ${fleetMeanMpg.toFixed(2)} - ${FLEET_MPG_SD_THRESHOLD} x ${fleetSdMpg.toFixed(2)} SD = floor ${thresholdMpg.toFixed(2)}`,
          evidence_fills: allFills,
        });
      }
    }

    // Flag 2: tank overflow, per fill — reuses the fraud-detector's own rule rather than
    // re-deriving the same math (same DEFAULT_TANK_CAPACITY_GAL, same tolerance).
    for (const fill of fills) {
      const ctx: FuelTransactionContext = {
        id: fill.id,
        operating_company_id: operatingCompanyId,
        unit_id: fill.unit_id,
        driver_id: fill.driver_id,
        transaction_at: fill.transaction_at,
        gallons: fill.gallons,
        location_lat: fill.location_lat,
        location_lng: fill.location_lng,
        location_city: fill.location_city,
        location_state: fill.location_state,
        pump_address: null,
      };
      const overflow = evaluateTankOverflow(ctx, DEFAULT_TANK_CAPACITY_GAL);
      if (overflow) {
        flags.push({
          kind: "tank_overflow",
          fuel_transaction_id: fill.id,
          gallons: fill.gallons ?? 0,
          tank_capacity_gal: DEFAULT_TANK_CAPACITY_GAL,
          transaction_at: fill.transaction_at,
          ...period,
          arithmetic: `${fill.gallons ?? 0} gal in one fill > ${DEFAULT_TANK_CAPACITY_GAL} gal tank capacity`,
          evidence_fills: [fillEvidence(fill)],
        });
      }
    }

    // Flag 3: two fills inside 90 minutes more than 50 miles apart — physically implausible for
    // one truck/driver. Distinct threshold from the real-time fraud detector's RULE_RAPID_MULTI
    // (30 min / different-station), this is a wider, scorecard-level sweep across the whole period.
    for (let i = 0; i < fills.length; i++) {
      for (let j = i + 1; j < fills.length; j++) {
        const a = fills[i]!;
        const b = fills[j]!;
        const minutesApart = Math.abs(new Date(b.transaction_at).getTime() - new Date(a.transaction_at).getTime()) / 60_000;
        if (minutesApart > RAPID_REFUEL_WINDOW_MINUTES) break; // fills sorted by time; no later b will be closer
        if (a.location_lat == null || a.location_lng == null || b.location_lat == null || b.location_lng == null) continue;
        const milesApart = haversineMiles(a.location_lat, a.location_lng, b.location_lat, b.location_lng);
        if (milesApart > RAPID_REFUEL_DISTANCE_MILES) {
          flags.push({
            ...period,
            arithmetic: `two fills ${minutesApart.toFixed(0)} min apart, ${milesApart.toFixed(1)} mi apart (> ${RAPID_REFUEL_DISTANCE_MILES} mi inside ${RAPID_REFUEL_WINDOW_MINUTES} min)`,
            evidence_fills: [fillEvidence(a), fillEvidence(b)],
            kind: "impossible_distance_refuel",
            fuel_transaction_id_a: a.id,
            fuel_transaction_id_b: b.id,
            minutes_apart: Number(minutesApart.toFixed(1)),
            miles_apart: Number(milesApart.toFixed(1)),
            transaction_at_a: a.transaction_at,
            transaction_at_b: b.transaction_at,
          });
        }
      }
    }

    // Flag 4: gallons bought exceed what even the fleet's WORST real MPG could have consumed for
    // the miles this driver actually drove — only evaluable when both miles and a fleet floor
    // exist; never computed against an odometer-gap driver's own (unknown) miles.
    if (miles.miles != null && miles.miles > 0 && fleetWorstMpg != null && fleetWorstMpg > 0) {
      const maxPlausibleGallons = miles.miles / fleetWorstMpg;
      if (fuel.gallons > maxPlausibleGallons) {
        flags.push({
          ...period,
          arithmetic:
            `${miles.miles} mi / fleet worst ${fleetWorstMpg.toFixed(2)} MPG = ${maxPlausibleGallons.toFixed(1)} gal plausible; ` +
            `bought ${fuel.gallons.toFixed(1)} gal`,
          evidence_fills: allFills,
          kind: "gallons_exceed_worst_case_consumption",
          gallons_bought: Number(fuel.gallons.toFixed(1)),
          miles_driven: miles.miles,
          fleet_worst_mpg: Number(fleetWorstMpg.toFixed(2)),
          max_plausible_gallons: Number(maxPlausibleGallons.toFixed(1)),
        });
      }
    }

    rows.push({
      driver_id: driverId,
      period_start: periodStart,
      period_end: periodEnd,
      gallons: Number(fuel.gallons.toFixed(2)),
      total_cost_cents: fuel.totalCostCents,
      miles_driven: miles.miles,
      mpg: mpg != null ? Number(mpg.toFixed(2)) : null,
      mpg_null_reason: mpgNullReason,
      gal_per_100mi: mpg != null && mpg > 0 ? Number((100 / mpg).toFixed(2)) : null,
      cost_per_mile_cents: miles.miles != null && miles.miles > 0 ? Number((fuel.totalCostCents / miles.miles).toFixed(1)) : null,
      fills_with_no_load: fuel.fillsWithNoLoad,
      fill_count: fuel.fillCount,
      excluded_fill_reasons: excludedByDriver.get(driverId) ?? {},
      flags,
    });
  }

  return rows.sort((a, b) => a.driver_id.localeCompare(b.driver_id));
}
