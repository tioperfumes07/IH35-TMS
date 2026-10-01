/**
 * ROUND 304 T-50 — Samsara Fuel & Energy efficiency (read) as the integrity engine's SECOND,
 * independent fuel signal.
 *
 * Signal 1 (ours): gallons PURCHASED for the unit in the window — fuel rows that pass the T-45 gate
 * (fuelPurchaseIneligibleReason, day precision), reefer diesel excluded (it feeds the trailer reefer).
 * Signal 2 (Samsara ECU): gallons the engine actually BURNED in the same window (fuelConsumedMl).
 *
 * excess_gallons = purchased - burned. Over any window the difference is bounded by the change in
 * tank level, and NO tank capacity is on file (mdata.units has no tank column), so a positive excess
 * is reported as a SUSPICION ("purchases_exceed_ecu_burn"), never a finding with an invented
 * tolerance. Every number Samsara does not send stays null. Nothing is written.
 */
import { fuelPurchaseIneligibleReason, FUEL_ROWS_WITH_STAMP_COUNT_SQL } from "../fuel/fuel-purchase-eligibility.js";
import type { FuelRowForEligibility } from "../fuel/fuel-purchase-eligibility.js";
import type { SamsaraFuelEnergyRow } from "../integrations/samsara/samsara-client.js";
import { loadUnitIdBySamsaraVehicleId } from "../integrations/samsara/samsara-positions.service.js";
import { loadDriverIdBySamsaraId } from "../integrations/samsara/driver-samsara-map.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";

export const ML_PER_US_GALLON = 3785.411784;
export const METERS_PER_MILE = 1609.344;

export type UnitFuelSignalStatus =
  | "no_unit"
  | "no_samsara_consumption"
  | "no_purchases_on_file"
  | "purchases_exceed_ecu_burn"
  | "consistent";

export type UnitFuelSignal = {
  samsara_vehicle_id: string;
  vehicle_name: string | null;
  unit_id: string | null;
  samsara_mpg: number | null;
  samsara_miles: number | null;
  samsara_burned_gallons: number | null;
  idle_pct: number | null;
  purchased_gallons: number;
  purchase_rows: number;
  excess_gallons: number | null;
  status: UnitFuelSignalStatus;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Pure: compare one vehicle's ECU burn with our purchased gallons. */
export function classifyUnitFuelSignal(
  v: SamsaraFuelEnergyRow,
  unitId: string | null,
  purchase: { gallons: number; rows: number } | undefined
): UnitFuelSignal {
  const burned = v.fuel_consumed_ml == null ? null : v.fuel_consumed_ml / ML_PER_US_GALLON;
  const purchased = purchase?.gallons ?? 0;
  const rows = purchase?.rows ?? 0;
  const base = {
    samsara_vehicle_id: v.subject_id,
    vehicle_name: v.subject_name,
    unit_id: unitId,
    samsara_mpg: v.efficiency_mpge == null ? null : r1(v.efficiency_mpge),
    samsara_miles: v.distance_traveled_meters == null ? null : r1(v.distance_traveled_meters / METERS_PER_MILE),
    samsara_burned_gallons: burned == null ? null : r3(burned),
    idle_pct:
      v.engine_run_time_ms && v.engine_idle_time_ms != null ? r1((v.engine_idle_time_ms / v.engine_run_time_ms) * 100) : null,
    purchased_gallons: r3(purchased),
    purchase_rows: rows,
  };
  if (!unitId) return { ...base, excess_gallons: null, status: "no_unit" };
  if (burned == null || burned <= 0) return { ...base, excess_gallons: null, status: "no_samsara_consumption" };
  if (rows === 0) return { ...base, excess_gallons: null, status: "no_purchases_on_file" };
  const excess = r3(purchased - burned);
  return { ...base, excess_gallons: excess, status: excess > 0 ? "purchases_exceed_ecu_burn" : "consistent" };
}

export type FuelEfficiencySignalResult = {
  window: { from: string; to: string };
  vehicles: UnitFuelSignal[];
  drivers: { samsara_driver_id: string; driver_name: string | null; driver_id: string | null; samsara_mpg: number | null; samsara_miles: number | null; idle_pct: number | null }[];
  counts: Record<UnitFuelSignalStatus, number>;
  purchase_rows_excluded_by_reason: Record<string, number>;
};

/**
 * Samsara driver id -> our driver id(s). samsara_driver_id lives on mdata.drivers for most drivers and
 * only in the integrations.samsara_drivers mirror for some -- use either, never guess (same rule as
 * driven-miles-legs.service.ts). A Samsara id that maps to more than one of our drivers is ambiguous;
 * callers treat size !== 1 as unmapped. Shared by T-50 and the E-21 integrity signal.
 */
/**
 * Samsara driver id -> local driver ids (Set kept for CC-2's fuel-integrity caller). Backed by the
 * CANONICAL map mdata.driver_samsara_accounts via the shared resolver (merges followed) -- never the
 * legacy mdata.drivers.samsara_driver_id column or the ingestion mirror. Each set has exactly one driver.
 */
export async function loadDriverIdsBySamsaraDriverId(client: PgClient, operatingCompanyId: string): Promise<Map<string, Set<string>>> {
  const byId = await loadDriverIdBySamsaraId(client as never, operatingCompanyId);
  return new Map([...byId].map(([sid, driverId]) => [sid, new Set([driverId])]));
}

export async function computeFuelEfficiencySignals(
  client: PgClient,
  input: {
    operatingCompanyId: string;
    fromIso: string;
    toIso: string;
    fetchReports: (kind: "vehicles" | "drivers") => Promise<SamsaraFuelEnergyRow[]>;
  }
): Promise<FuelEfficiencySignalResult> {
  const [vehicleRows, driverRows] = await Promise.all([input.fetchReports("vehicles"), input.fetchReports("drivers")]);
  const unitByVehicle = await loadUnitIdBySamsaraVehicleId(client, input.operatingCompanyId);

  const fuel = await client.query(
    `WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
     SELECT f.unit_id::text AS unit_id, f.fuel_type, f.gallons, f.transaction_at, f.voided_at, f.same_stamp_count
       FROM f WHERE f.transaction_at >= $2::timestamptz AND f.transaction_at < $3::timestamptz AND f.unit_id IS NOT NULL`,
    [input.operatingCompanyId, input.fromIso, input.toIso]
  );
  const purchases = new Map<string, { gallons: number; rows: number }>();
  const excluded: Record<string, number> = {};
  for (const f of fuel.rows as (FuelRowForEligibility & { unit_id: string })[]) {
    const reason = fuelPurchaseIneligibleReason(f, { requirePumpTime: false }) ?? (f.fuel_type === "reefer_diesel" ? "reefer_fuel_not_vehicle_fuel" : null);
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      continue;
    }
    const p = purchases.get(f.unit_id) ?? { gallons: 0, rows: 0 };
    p.gallons += Number(f.gallons);
    p.rows += 1;
    purchases.set(f.unit_id, p);
  }

  const vehicles = vehicleRows.map((v) => {
    const unitId = unitByVehicle.get(v.subject_id) ?? null;
    return classifyUnitFuelSignal(v, unitId, unitId ? purchases.get(unitId) : undefined);
  });

  // Samsara driver -> local driver: the CANONICAL map (shared resolver, merges followed).
  const driverBySid = await loadDriverIdBySamsaraId(client as never, input.operatingCompanyId);
  const drivers = driverRows.map((d) => {
    return {
      samsara_driver_id: d.subject_id,
      driver_name: d.subject_name,
      driver_id: driverBySid.get(d.subject_id) ?? null,
      samsara_mpg: d.efficiency_mpge == null ? null : r1(d.efficiency_mpge),
      samsara_miles: d.distance_traveled_meters == null ? null : r1(d.distance_traveled_meters / METERS_PER_MILE),
      idle_pct: d.engine_run_time_ms && d.engine_idle_time_ms != null ? r1((d.engine_idle_time_ms / d.engine_run_time_ms) * 100) : null,
    };
  });

  const counts = { no_unit: 0, no_samsara_consumption: 0, no_purchases_on_file: 0, purchases_exceed_ecu_burn: 0, consistent: 0 };
  for (const v of vehicles) counts[v.status] += 1;
  return { window: { from: input.fromIso, to: input.toIso }, vehicles, drivers, counts, purchase_rows_excluded_by_reason: excluded };
}
