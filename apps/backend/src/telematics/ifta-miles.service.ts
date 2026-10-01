/**
 * ROUND 304 T-49 — IFTA miles by jurisdiction (read), from Samsara's IFTA vehicle report, linked to
 * our units, side by side with the tax-paid gallons our own fuel rows can support.
 *
 * - Samsara's caveat: the most recent 72 h is still processing. A period ending inside that window
 *   is NOT queried — it returns not_ready with the reason. A period Samsara itself says is still
 *   processing (400) is also not_ready, never an error and never a partial number.
 * - Miles come from Samsara GPS. Gallons come ONLY from our fuel rows that pass the T-45 gate
 *   (fuelPurchaseIneligibleReason, day precision is enough for a monthly/quarterly report) and carry
 *   a location_state. Rows without a state are counted, never assigned to a jurisdiction.
 *   Reefer diesel is excluded from tax-paid gallons (it does not propel the vehicle).
 * - No MPG is computed here: a ratio over incomplete gallons would be a guess.
 */
import { fuelPurchaseIneligibleReason, FUEL_ROWS_WITH_STAMP_COUNT_SQL } from "../fuel/fuel-purchase-eligibility.js";
import type { FuelRowForEligibility } from "../fuel/fuel-purchase-eligibility.js";
import type { SamsaraIftaPeriod, SamsaraIftaVehicleReportResult } from "../integrations/samsara/samsara-client.js";
import { SamsaraApiError } from "../integrations/samsara/samsara-client.js";
import { loadUnitIdBySamsaraVehicleId } from "../integrations/samsara/samsara-positions.service.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";

export const IFTA_PROCESSING_WINDOW_HOURS = 72;
export const METERS_PER_MILE = 1609.344;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type IftaPeriodInput = { year: number; month?: number; quarter?: 1 | 2 | 3 | 4 };

/** UTC [start, end) of the period. */
export function iftaPeriodBounds(p: IftaPeriodInput): { start: Date; end: Date } {
  if (p.month != null) return { start: new Date(Date.UTC(p.year, p.month - 1, 1)), end: new Date(Date.UTC(p.year, p.month, 1)) };
  const q = p.quarter ?? 1;
  return { start: new Date(Date.UTC(p.year, (q - 1) * 3, 1)), end: new Date(Date.UTC(p.year, q * 3, 1)) };
}

export function iftaPeriodNotReady(p: IftaPeriodInput, now: Date): boolean {
  return iftaPeriodBounds(p).end.getTime() > now.getTime() - IFTA_PROCESSING_WINDOW_HOURS * 3_600_000;
}

export function toSamsaraIftaPeriod(p: IftaPeriodInput): SamsaraIftaPeriod {
  if (p.month != null) return { year: p.year, month: MONTHS[p.month - 1] };
  return { year: p.year, quarter: `Q${p.quarter ?? 1}` as SamsaraIftaPeriod["quarter"] };
}

export type IftaJurisdictionRow = {
  jurisdiction: string;
  total_miles: number;
  taxable_miles: number;
  tax_paid_gallons: number;
  fuel_rows: number;
};

export type IftaMilesResult =
  | { status: "not_ready"; reason: "within_72h_processing_window" | "samsara_still_processing"; period: { start: string; end: string } }
  | {
      status: "ok";
      period: { start: string; end: string };
      jurisdictions: IftaJurisdictionRow[];
      vehicles: { samsara_vehicle_id: string; vehicle_name: string | null; unit_id: string | null; total_miles: number }[];
      unlinked_samsara_vehicles: number;
      gallons_coverage: { eligible_rows: number; rows_without_state: number; excluded_by_reason: Record<string, number> };
      samsara_troubleshooting: Record<string, unknown> | null;
    };

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function computeIftaMiles(
  client: PgClient,
  input: { operatingCompanyId: string; period: IftaPeriodInput; now?: Date; fetchReport: (p: SamsaraIftaPeriod) => Promise<SamsaraIftaVehicleReportResult> }
): Promise<IftaMilesResult> {
  const { start, end } = iftaPeriodBounds(input.period);
  const period = { start: start.toISOString(), end: end.toISOString() };
  if (iftaPeriodNotReady(input.period, input.now ?? new Date())) return { status: "not_ready", reason: "within_72h_processing_window", period };

  let report: SamsaraIftaVehicleReportResult;
  try {
    report = await input.fetchReport(toSamsaraIftaPeriod(input.period));
  } catch (error) {
    if (error instanceof SamsaraApiError && error.statusCode === 400 && /still be processing/i.test(JSON.stringify(error.body ?? ""))) {
      return { status: "not_ready", reason: "samsara_still_processing", period };
    }
    throw error;
  }

  const unitByVehicle = await loadUnitIdBySamsaraVehicleId(client, input.operatingCompanyId);
  const byJurisdiction = new Map<string, IftaJurisdictionRow>();
  const row = (j: string) => {
    let r = byJurisdiction.get(j);
    if (!r) byJurisdiction.set(j, (r = { jurisdiction: j, total_miles: 0, taxable_miles: 0, tax_paid_gallons: 0, fuel_rows: 0 }));
    return r;
  };
  const vehicles = report.vehicles.map((v) => {
    let meters = 0;
    for (const j of v.jurisdictions) {
      const r = row(j.jurisdiction);
      r.total_miles += j.total_meters / METERS_PER_MILE;
      r.taxable_miles += j.taxable_meters / METERS_PER_MILE;
      meters += j.total_meters;
    }
    return { samsara_vehicle_id: v.samsara_vehicle_id, vehicle_name: v.vehicle_name, unit_id: unitByVehicle.get(v.samsara_vehicle_id) ?? null, total_miles: round1(meters / METERS_PER_MILE) };
  });

  const fuel = await client.query(
    `WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
     SELECT f.fuel_type, f.gallons, f.transaction_at, f.voided_at, f.same_stamp_count, upper(trim(f.location_state)) AS state
       FROM f WHERE f.transaction_at >= $2::timestamptz AND f.transaction_at < $3::timestamptz`,
    [input.operatingCompanyId, period.start, period.end]
  );
  const excluded: Record<string, number> = {};
  let eligible = 0;
  let withoutState = 0;
  for (const f of fuel.rows as (FuelRowForEligibility & { state: string | null })[]) {
    const reason = fuelPurchaseIneligibleReason(f, { requirePumpTime: false }) ?? (f.fuel_type === "reefer_diesel" ? "reefer_fuel_not_vehicle_fuel" : null);
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
      continue;
    }
    eligible += 1;
    if (!f.state) {
      withoutState += 1;
      continue;
    }
    const r = row(String(f.state));
    r.tax_paid_gallons += Number(f.gallons);
    r.fuel_rows += 1;
  }

  const jurisdictions = [...byJurisdiction.values()]
    .map((r) => ({ ...r, total_miles: round1(r.total_miles), taxable_miles: round1(r.taxable_miles), tax_paid_gallons: round3(r.tax_paid_gallons) }))
    .sort((a, b) => b.total_miles - a.total_miles);

  return {
    status: "ok",
    period,
    jurisdictions,
    vehicles,
    unlinked_samsara_vehicles: vehicles.filter((v) => !v.unit_id).length,
    gallons_coverage: { eligible_rows: eligible, rows_without_state: withoutState, excluded_by_reason: excluded },
    samsara_troubleshooting: report.troubleshooting,
  };
}
