/**
 * ROUND 304 T-48 — push our fuel purchases into Samsara (POST /fuel-purchase), twice daily.
 *
 * HARD GATE (owner order): a row is pushed only when fuelPurchaseIneligibleReason(row,
 * { requirePumpTime: true }) is null — real gallons > 0, motor fuel, a real pump time (not a shared
 * import stamp, not a date-only 00:00/12:00 stamp). Every other row is SKIPPED with its reason.
 * Nothing is ever substituted: no default litres, no estimated price, no import time as pump time,
 * no guessed location, no guessed vehicle. Litres = gallons x 3.785411784 is a unit conversion of a
 * real measured value, not an estimate.
 *
 * Vehicle: mirror-first (integrations.samsara_vehicles.local_unit_id), mdata.units.samsara_vehicle_id
 * only when the mirror has nothing for that unit (T122 carries a stale id on mdata.units). A unit
 * with more than one mirror vehicle id is ambiguous -> skipped, never picked.
 *
 * Reefer diesel is skipped: it is burned by the trailer's reefer, not the tractor, so posting it
 * against the tractor's vehicleId would corrupt Samsara's fuel efficiency for that truck.
 *
 * Ledger: integrations.integration_sync_log (integration='samsara', sync_kind='fuel_purchase_push'),
 * one row per fuel transaction outcome. A transaction with a 'pushed' row is never pushed again
 * (transactionReference = our fuel_transactions.id). A skip is recorded once per (row, reason) — a
 * repeated identical skip on the next tick is not re-written.
 */
import { fuelPurchaseIneligibleReason, FUEL_ROWS_WITH_STAMP_COUNT_SQL } from "../../fuel/fuel-purchase-eligibility.js";
import type { FuelPurchaseIneligibleReason } from "../../fuel/fuel-purchase-eligibility.js";
import type { SamsaraFuelPurchaseBody } from "./samsara-client.js";
import { SamsaraApiError } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";

export const FUEL_PURCHASE_PUSH_SYNC_KIND = "fuel_purchase_push";
export const LITERS_PER_US_GALLON = 3.785411784;

export type FuelPushSkipReason =
  | FuelPurchaseIneligibleReason
  | "reefer_fuel_not_vehicle_fuel"
  | "no_unit"
  | "no_samsara_vehicle"
  | "ambiguous_samsara_vehicle"
  | "no_location"
  | "no_price"
  | "derived_time_not_high_confidence";

export type FuelPushRow = {
  id: string;
  unit_id: string | null;
  fuel_type: string | null;
  gallons: string | number | null;
  total_cost: string | number | null;
  transaction_at: string | Date;
  voided_at: string | Date | null;
  location_city: string | null;
  location_state: string | null;
  same_stamp_count: number;
  /** ORDERS 2026-10-01 row 7: CC-2's derived pump time (fuel.fuel_transaction_derivations), when stored. */
  derived_time?: string | Date | null;
  derived_confidence?: "high" | "medium" | null;
  derived_fuel_stop_label?: string | null;
};

export type FuelPushPlanItem =
  | { fuel_transaction_id: string; action: "push"; body: SamsaraFuelPurchaseBody }
  | { fuel_transaction_id: string; action: "skip"; reason: FuelPushSkipReason }
  | { fuel_transaction_id: string; action: "already_pushed" };

/** Pure: decide push / skip / already_pushed for each row. No I/O. */
export function planFuelPurchasePushes(
  rows: FuelPushRow[],
  samsaraVehicleIdsByUnit: Map<string, string[]>,
  pushedIds: Set<string>
): FuelPushPlanItem[] {
  return rows.map((row): FuelPushPlanItem => {
    if (pushedIds.has(row.id)) return { fuel_transaction_id: row.id, action: "already_pushed" };
    // A date-only row may still be pushed with CC-2's DERIVED pump time -- the start of the one stop the
    // truck made inside a fuel-stop fence that day (confidence 'high' only: one fill, one stop). Never
    // the import time, never a medium-confidence time shared by several fills.
    const gate = fuelPurchaseIneligibleReason(row, { requirePumpTime: true });
    const useDerived = gate === "date_only_precision" && row.derived_time != null && row.derived_confidence === "high";
    if (gate === "date_only_precision" && row.derived_time != null && row.derived_confidence !== "high") {
      return { fuel_transaction_id: row.id, action: "skip", reason: "derived_time_not_high_confidence" };
    }
    if (gate && !useDerived) return { fuel_transaction_id: row.id, action: "skip", reason: gate };
    if (row.fuel_type === "reefer_diesel") return { fuel_transaction_id: row.id, action: "skip", reason: "reefer_fuel_not_vehicle_fuel" };
    if (!row.unit_id) return { fuel_transaction_id: row.id, action: "skip", reason: "no_unit" };
    const vehicleIds = samsaraVehicleIdsByUnit.get(row.unit_id) ?? [];
    if (vehicleIds.length === 0) return { fuel_transaction_id: row.id, action: "skip", reason: "no_samsara_vehicle" };
    if (vehicleIds.length > 1) return { fuel_transaction_id: row.id, action: "skip", reason: "ambiguous_samsara_vehicle" };
    const city = row.location_city?.trim() ?? "";
    const state = row.location_state?.trim() ?? "";
    // Location: the fill's own city/state, else (derived rows only) the fuel-stop fence the time came from.
    const fenceLabel = useDerived ? row.derived_fuel_stop_label?.trim() ?? "" : "";
    const location = city && state ? `${city}, ${state}` : fenceLabel;
    if (!location) return { fuel_transaction_id: row.id, action: "skip", reason: "no_location" };
    const price = row.total_cost == null ? NaN : Number(row.total_cost);
    if (!Number.isFinite(price) || price <= 0) return { fuel_transaction_id: row.id, action: "skip", reason: "no_price" };
    const gallons = Number(row.gallons);
    const rawAt = useDerived ? row.derived_time! : row.transaction_at;
    const at = rawAt instanceof Date ? rawAt : new Date(rawAt);
    return {
      fuel_transaction_id: row.id,
      action: "push",
      body: {
        transactionReference: row.id,
        transactionTime: at.toISOString(),
        transactionLocation: location,
        fuelQuantityLiters: (gallons * LITERS_PER_US_GALLON).toFixed(3),
        transactionPrice: { amount: price.toFixed(2), currency: "usd" },
        vehicleId: vehicleIds[0]!,
        iftaFuelType: row.fuel_type === "gas" ? "Gasoline" : "Diesel",
      },
    };
  });
}

/** Mirror-first unit -> Samsara vehicle ids. mdata.units is the fallback only for units the mirror lacks. */
export async function loadSamsaraVehicleIdsByUnit(client: PgClient, operatingCompanyId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const mirror = await client.query(
    `SELECT local_unit_id::text AS unit_id, samsara_vehicle_id::text AS vid
       FROM integrations.samsara_vehicles
      WHERE operating_company_id = $1::uuid AND local_unit_id IS NOT NULL AND samsara_vehicle_id IS NOT NULL`,
    [operatingCompanyId]
  );
  for (const r of mirror.rows) {
    const list = out.get(String(r.unit_id)) ?? [];
    if (!list.includes(String(r.vid))) list.push(String(r.vid));
    out.set(String(r.unit_id), list);
  }
  const units = await client.query(
    `SELECT id::text AS unit_id, samsara_vehicle_id::text AS vid
       FROM mdata.units
      WHERE samsara_vehicle_id IS NOT NULL AND deactivated_at IS NULL
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid`,
    [operatingCompanyId]
  );
  for (const r of units.rows) {
    if (!out.has(String(r.unit_id))) out.set(String(r.unit_id), [String(r.vid)]);
  }
  return out;
}

type LedgerState = { pushed: Set<string>; lastSkipReason: Map<string, string> };

async function loadLedger(client: PgClient, operatingCompanyId: string): Promise<LedgerState> {
  const res = await client.query(
    `SELECT DISTINCT ON (payload->>'fuel_transaction_id')
            payload->>'fuel_transaction_id' AS id, payload->>'outcome' AS outcome, payload->>'reason' AS reason,
            bool_or(payload->>'outcome' = 'pushed') OVER (PARTITION BY payload->>'fuel_transaction_id') AS ever_pushed
       FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = $2
      ORDER BY payload->>'fuel_transaction_id', started_at DESC`,
    [operatingCompanyId, FUEL_PURCHASE_PUSH_SYNC_KIND]
  );
  const pushed = new Set<string>();
  const lastSkipReason = new Map<string, string>();
  for (const r of res.rows) {
    if (r.ever_pushed) pushed.add(String(r.id));
    else if (r.outcome === "skipped" && r.reason) lastSkipReason.set(String(r.id), String(r.reason));
  }
  return { pushed, lastSkipReason };
}

async function recordOutcome(
  client: PgClient,
  operatingCompanyId: string,
  payload: { fuel_transaction_id: string; outcome: "pushed" | "skipped" | "failed"; reason: string | null; samsara_fuel_purchase_id?: string | null }
): Promise<void> {
  await client.query(
    `INSERT INTO integrations.integration_sync_log
       (operating_company_id, integration, sync_kind, started_at, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
     VALUES ($1::uuid, 'samsara', $2, now(), now(), $3, $4, 0, 0, $5, $6::jsonb)`,
    [
      operatingCompanyId,
      FUEL_PURCHASE_PUSH_SYNC_KIND,
      payload.outcome !== "failed",
      payload.outcome === "pushed" ? 1 : 0,
      payload.outcome === "failed" ? payload.reason : null,
      JSON.stringify(payload),
    ]
  );
}

export type FuelPushRunResult = {
  operating_company_id: string;
  mode: "dry_run" | "apply";
  rows_considered: number;
  would_push: number;
  pushed: number;
  failed: number;
  already_pushed: number;
  skipped_by_reason: Record<string, number>;
  skips_recorded: number;
  push_sample: SamsaraFuelPurchaseBody[];
};

export type FuelPurchasePoster = { createFuelPurchase(body: SamsaraFuelPurchaseBody): Promise<{ samsara_fuel_purchase_id: string | null }> };

/**
 * Dry run (apply=false) writes nothing anywhere — no Samsara call, no ledger row.
 * Apply posts each pushable row and records every push, failure and (new) skip.
 */
export async function runFuelPurchasePush(
  client: PgClient,
  operatingCompanyId: string,
  opts: { apply: boolean; poster: FuelPurchasePoster | null }
): Promise<FuelPushRunResult> {
  // CC-2's derivation side table lands with CC-1's migration -- feature-detected, never assumed.
  const derivedReady = Boolean(
    (await client.query(`SELECT to_regclass('fuel.fuel_transaction_derivations') IS NOT NULL AS ok`)).rows[0]?.ok
  );
  const rowsRes = await client.query(
    `WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
     SELECT f.id::text AS id, f.unit_id::text AS unit_id, f.fuel_type, f.gallons, f.total_cost, f.transaction_at,
            f.voided_at, f.location_city, f.location_state, f.same_stamp_count
            ${derivedReady ? ", d.transaction_at_derived AS derived_time, d.confidence AS derived_confidence, g.label AS derived_fuel_stop_label" : ""}
       FROM f
       ${derivedReady ? "LEFT JOIN fuel.fuel_transaction_derivations d ON d.fuel_transaction_id = f.id LEFT JOIN geo.geofences g ON g.id = d.geofence_id" : ""}
      ORDER BY f.transaction_at, f.id`,
    [operatingCompanyId]
  );
  const rows = rowsRes.rows as FuelPushRow[];
  const ledger = await loadLedger(client, operatingCompanyId);
  const vehicles = await loadSamsaraVehicleIdsByUnit(client, operatingCompanyId);
  const plan = planFuelPurchasePushes(rows, vehicles, ledger.pushed);

  const result: FuelPushRunResult = {
    operating_company_id: operatingCompanyId,
    mode: opts.apply ? "apply" : "dry_run",
    rows_considered: rows.length,
    would_push: 0,
    pushed: 0,
    failed: 0,
    already_pushed: 0,
    skipped_by_reason: {},
    skips_recorded: 0,
    push_sample: [],
  };

  for (const item of plan) {
    if (item.action === "already_pushed") {
      result.already_pushed += 1;
      continue;
    }
    if (item.action === "skip") {
      result.skipped_by_reason[item.reason] = (result.skipped_by_reason[item.reason] ?? 0) + 1;
      if (opts.apply && ledger.lastSkipReason.get(item.fuel_transaction_id) !== item.reason) {
        await recordOutcome(client, operatingCompanyId, { fuel_transaction_id: item.fuel_transaction_id, outcome: "skipped", reason: item.reason });
        result.skips_recorded += 1;
      }
      continue;
    }
    result.would_push += 1;
    if (result.push_sample.length < 5) result.push_sample.push(item.body);
    if (!opts.apply) continue;
    if (!opts.poster) throw new Error("fuel_purchase_push: apply requested without a Samsara poster");
    try {
      const posted = await opts.poster.createFuelPurchase(item.body);
      await recordOutcome(client, operatingCompanyId, {
        fuel_transaction_id: item.fuel_transaction_id,
        outcome: "pushed",
        reason: null,
        samsara_fuel_purchase_id: posted.samsara_fuel_purchase_id,
      });
      result.pushed += 1;
    } catch (error) {
      const message =
        error instanceof SamsaraApiError
          ? `${error.message}${error.statusCode ? `:http_${error.statusCode}` : ""}`
          : String((error as Error)?.message ?? error);
      await recordOutcome(client, operatingCompanyId, { fuel_transaction_id: item.fuel_transaction_id, outcome: "failed", reason: message });
      result.failed += 1;
    }
  }
  return result;
}
