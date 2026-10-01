/**
 * ROUND 313 E-23 — keep Samsara's Fuel & Energy report, one row per vehicle / driver per day
 * (integrations.samsara_fuel_reports, migration 202615181100). Days are UTC days -- Samsara's own buckets.
 * Vehicle rows link to the unit and carry that day's eligible purchased gallons (the same T-45 gate + reefer
 * exclusion the T-50 signal uses), so burned vs purchased sits on one row; driver rows link to the driver via
 * the canonical Samsara account map. Every number Samsara does not send stays NULL.
 */
import { fuelPurchaseIneligibleReason, FUEL_ROWS_WITH_STAMP_COUNT_SQL, type FuelRowForEligibility } from "../fuel/fuel-purchase-eligibility.js";
import type { SamsaraFuelEnergyRow } from "../integrations/samsara/samsara-client.js";
import { loadUnitIdBySamsaraVehicleId } from "../integrations/samsara/samsara-positions.service.js";
import { loadDriverIdBySamsaraId } from "../integrations/samsara/driver-samsara-map.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";
import { METERS_PER_MILE, ML_PER_US_GALLON } from "./fuel-efficiency-signal.service.js";

type FetchReports = (kind: "vehicles" | "drivers", startIso: string, endIso: string) => Promise<SamsaraFuelEnergyRow[]>;
const r2 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/**
 * Samsara's fuel-energy report is bucketed by whole UTC day: any window touching a day returns that entire day
 * (probed 2026-10-01 on T148: 09-30 05:00-17:00Z == 09-30 00:00-23:59Z == 930 mi / 24 h, while a window ending
 * 10-01 05:00Z returned 09-30 + 10-01 = 1,172 mi / 36 h). So one report_date = one UTC day, asked for strictly
 * inside that day.
 */
function utcDayBounds(day: string) {
  return { startIso: `${day}T00:00:00Z`, endIso: `${day}T23:59:59Z`, purchaseEndIso: new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString() };
}

export async function ingestSamsaraFuelReportsForDay(client: PgClient, operatingCompanyId: string, day: string, fetchReports: FetchReports) {
  const { startIso, endIso, purchaseEndIso } = utcDayBounds(day);
  const [vehicles, drivers] = [await fetchReports("vehicles", startIso, endIso), await fetchReports("drivers", startIso, endIso)];
  const unitByVehicle = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  const driverBySamsara = await loadDriverIdBySamsaraId(client as never, operatingCompanyId);

  const fuel = await client.query(
    `WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
     SELECT f.unit_id::text AS unit_id, f.fuel_type, f.gallons, f.transaction_at, f.voided_at, f.same_stamp_count
       FROM f WHERE f.transaction_at >= $2::timestamptz AND f.transaction_at < $3::timestamptz AND f.unit_id IS NOT NULL`,
    [operatingCompanyId, startIso, purchaseEndIso]
  );
  // Fuel cards import in batches: a day past the newest imported transaction is "not imported yet", not "0 bought".
  const lastImport = await client.query(
    `SELECT max(transaction_at) AS m FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
    [operatingCompanyId]
  );
  const imported = lastImport.rows[0]?.m != null && new Date(lastImport.rows[0].m as string).getTime() >= Date.parse(purchaseEndIso);
  const purchases = new Map<string, { gal: number; n: number }>();
  for (const f of fuel.rows as (FuelRowForEligibility & { unit_id: string })[]) {
    if (fuelPurchaseIneligibleReason(f, { requirePumpTime: false }) || f.fuel_type === "reefer_diesel") continue;
    const p = purchases.get(f.unit_id) ?? { gal: 0, n: 0 };
    p.gal += Number(f.gallons);
    p.n += 1;
    purchases.set(f.unit_id, p);
  }

  let written = 0, linked = 0;
  const upsert = async (kind: "vehicle" | "driver", row: SamsaraFuelEnergyRow, unitId: string | null, driverId: string | null) => {
    const p = unitId ? purchases.get(unitId) : undefined;
    await client.query(
      `INSERT INTO integrations.samsara_fuel_reports
         (operating_company_id, report_date, subject_kind, samsara_subject_id, subject_name, unit_id, driver_id,
          fuel_burned_gal, distance_mi, efficiency_mpg, engine_run_hours, engine_idle_hours, purchased_gal, purchase_count, read_at)
       VALUES ($1::uuid, $2::date, $3, $4, $5, $6::uuid, $7::uuid, $8, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT (operating_company_id, subject_kind, samsara_subject_id, report_date) DO UPDATE SET
         subject_name = EXCLUDED.subject_name, unit_id = EXCLUDED.unit_id, driver_id = EXCLUDED.driver_id,
         fuel_burned_gal = EXCLUDED.fuel_burned_gal, distance_mi = EXCLUDED.distance_mi, efficiency_mpg = EXCLUDED.efficiency_mpg,
         engine_run_hours = EXCLUDED.engine_run_hours, engine_idle_hours = EXCLUDED.engine_idle_hours,
         purchased_gal = EXCLUDED.purchased_gal, purchase_count = EXCLUDED.purchase_count, read_at = now(), updated_at = now()`,
      [operatingCompanyId, day, kind, row.subject_id, row.subject_name, unitId, driverId,
       r2(row.fuel_consumed_ml == null ? null : row.fuel_consumed_ml / ML_PER_US_GALLON),
       r2(row.distance_traveled_meters == null ? null : row.distance_traveled_meters / METERS_PER_MILE),
       r2(row.efficiency_mpge), r2(row.engine_run_time_ms == null ? null : row.engine_run_time_ms / 3_600_000),
       r2(row.engine_idle_time_ms == null ? null : row.engine_idle_time_ms / 3_600_000),
       kind === "vehicle" && unitId && imported ? r2(p?.gal ?? 0) : null, kind === "vehicle" && unitId && imported ? p?.n ?? 0 : null]
    );
    written += 1;
    if (unitId || driverId) linked += 1;
  };
  for (const v of vehicles) await upsert("vehicle", v, unitByVehicle.get(v.subject_id) ?? null, null);
  for (const d of drivers) await upsert("driver", d, null, driverBySamsara.get(d.subject_id) ?? null);
  return { day, vehicles: vehicles.length, drivers: drivers.length, written, linked };
}

/** Yesterday + today (UTC days) by default (Samsara settles late), or a catch-up span of `days`. */
export async function ingestSamsaraFuelReports(client: PgClient, operatingCompanyId: string, fetchReports: FetchReports, days = 2) {
  const r = await client.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day FROM generate_series((now() AT TIME ZONE 'UTC')::date - ($1::int - 1), (now() AT TIME ZONE 'UTC')::date, interval '1 day') d`,
    [days]
  );
  const out = [];
  for (const row of r.rows) out.push(await ingestSamsaraFuelReportsForDay(client, operatingCompanyId, String(row.day), fetchReports));
  return out;
}
