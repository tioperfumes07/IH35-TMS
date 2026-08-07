/**
 * Relay → canonical fuel.fuel_transactions bridge.
 *
 * PR-1 per RELAY-BOOKING-EXECUTION-SPEC-2026-07-16:
 * After Relay staging upsert, also upsert IFTA/history rows into fuel.fuel_transactions.
 * This bridge does NOT call the fuel GL poster — the ingest caller flushes
 * maybePostFuelExpenseFromCanonicalTxn AFTER commit (EXPENSE_GL_POSTING_ENABLED).
 *
 * source = 'other' until an additive migration expands the CHECK to include 'relay'
 * (HOLD / owner-applied). Identity is carried in source_row_hash + notes.
 *
 * WAVE-H2: resolve load_id / vendor_id when join keys exist (same helpers as card import).
 * Do not hardcode NULL when merchant/unit/driver can match.
 */
import { createHash } from "node:crypto";
import type { DbClient } from "./db-client.type.js";
import type { RelayFuelTransaction } from "./relay-client.js";
import { resolveLoadId, resolveVendorId } from "../../fuel/fuel-transaction-import.js";

function mapFuelType(raw: string | null | undefined): "diesel" | "def" | "gas" | "reefer_diesel" | "other" {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "diesel";
  if (t.includes("def") || t.includes("urea") || t.includes("exhaust")) return "def";
  if (t.includes("reefer") || t.includes("refriger")) return "reefer_diesel";
  if (t.includes("gas") || t.includes("unleaded") || t.includes("petrol")) return "gas";
  if (t.includes("diesel") || t.includes("ulsd") || t.includes("biodiesel")) return "diesel";
  return "other";
}

function dollarsToNumber(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Upsert one canonical fuel.fuel_transactions row per Relay transaction (aggregates fuel_items gallons).
 * Idempotent on (operating_company_id, source_row_hash) where hash = sha256("relay:" + transaction_id).
 */
export async function bridgeRelayFuelToCanonical(
  client: DbClient,
  operatingCompanyId: string,
  tx: RelayFuelTransaction,
  matched: { driver_id: string | null; unit_id: string | null }
): Promise<{ bridged: boolean; fuel_transaction_id: string | null }> {
  const fuelItems = tx.fuel_items ?? [];
  let gallons = 0;
  let fuelType: "diesel" | "def" | "gas" | "reefer_diesel" | "other" = "diesel";
  let pricedGallons = 0;
  let priceAccum = 0;

  for (const item of fuelItems) {
    const vol = item.volume != null && item.volume !== "" ? Number(item.volume) : NaN;
    if (Number.isFinite(vol) && vol > 0) {
      gallons += vol;
      const ppg = dollarsToNumber(item.discounted_price_per_unit) ?? dollarsToNumber(item.retail_price_per_unit);
      if (ppg != null) {
        pricedGallons += vol;
        priceAccum += ppg * vol;
      }
    }
    // Prefer first non-fee fuel line's type
    if (item.fuel_type || item.fuel_type_description) {
      fuelType = mapFuelType(item.fuel_type_description ?? item.fuel_type);
    }
  }

  const totalPaid = dollarsToNumber(tx.total_amount_paid) ?? 0;
  const pricePerGallon = pricedGallons > 0 ? priceAccum / pricedGallons : gallons > 0 ? totalPaid / gallons : null;
  const sourceRowHash = createHash("sha256").update(`relay:${tx.transaction_id}`).digest("hex");
  const vendorId = await resolveVendorId(client, operatingCompanyId, tx.merchant?.name ?? null);
  const loadId = await resolveLoadId(
    client,
    operatingCompanyId,
    matched.unit_id,
    matched.driver_id,
    tx.created_at
  );
  const loadExemptionReason = loadId ? null : "relay_ingest_no_load_link";
  const notes = [
    `relay_bridge=1`,
    `relay_txn=${tx.transaction_id}`,
    tx.merchant?.name ? `merchant=${tx.merchant.name}` : null,
    !loadId ? "load_unresolved=1" : null,
    tx.merchant?.name && !vendorId ? "vendor_unmatched=1" : null,
  ]
    .filter(Boolean)
    .join("; ");

  const insertRes = await client.query<{ id: string }>(
    `
      INSERT INTO fuel.fuel_transactions (
        operating_company_id,
        transaction_at,
        purchased_at,
        load_id,
        driver_id,
        unit_id,
        vendor_id,
        fuel_type,
        gallons,
        price_per_gallon,
        total_cost,
        location_city,
        location_state,
        location_lat,
        location_lng,
        transaction_reference,
        source,
        source_row_hash,
        notes,
        imported_at,
        load_required,
        load_exemption_reason
      )
      VALUES (
        $1, $2::timestamptz, $2::timestamptz, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15, 'other', $16, $17, now(),
        -- CLS-DISP-WIRE-06: load_required is DERIVED from whether a load actually resolved. It used
        -- to be the literal true while load_exemption_reason was simultaneously set to
        -- 'relay_ingest_no_load_link' — a row asserting both "a load is required here" and "here is
        -- why it is exempt". Four such rows exist on prod (created 2026-08-05), and every future
        -- relay ingest without a resolvable load would mint another, so any load-linkage ratchet
        -- would go permanently RED on expected state.
        $19, $18
      )
      ON CONFLICT (operating_company_id, source_row_hash) DO UPDATE SET
        transaction_at = EXCLUDED.transaction_at,
        purchased_at = EXCLUDED.purchased_at,
        driver_id = COALESCE(EXCLUDED.driver_id, fuel.fuel_transactions.driver_id),
        unit_id = COALESCE(EXCLUDED.unit_id, fuel.fuel_transactions.unit_id),
        load_id = COALESCE(EXCLUDED.load_id, fuel.fuel_transactions.load_id),
        vendor_id = COALESCE(EXCLUDED.vendor_id, fuel.fuel_transactions.vendor_id),
        -- Keep the pair consistent on re-ingest too. Once a load resolves, the row genuinely requires
        -- one and the exemption is cleared ("an assigned load clears the exemption", the same rule
        -- fuel-transactions.routes.ts states for the manual path).
        load_required = (COALESCE(EXCLUDED.load_id, fuel.fuel_transactions.load_id) IS NOT NULL),
        -- EXISTING reason wins over the incoming one, deliberately — the reverse of the old
        -- precedence. The 1,548-row historical cohort carries the owner-ruled
        -- 'PRE_TMS_DISPATCH_IMPORT' exemption; letting a re-ingest overwrite it with
        -- 'relay_ingest_no_load_link' would erase the ruling that made that cohort expected state.
        load_exemption_reason = CASE
          WHEN COALESCE(EXCLUDED.load_id, fuel.fuel_transactions.load_id) IS NOT NULL THEN NULL
          ELSE COALESCE(fuel.fuel_transactions.load_exemption_reason, EXCLUDED.load_exemption_reason)
        END,
        gallons = EXCLUDED.gallons,
        price_per_gallon = EXCLUDED.price_per_gallon,
        total_cost = EXCLUDED.total_cost,
        location_city = EXCLUDED.location_city,
        location_state = EXCLUDED.location_state,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      operatingCompanyId,
      tx.created_at,
      loadId,
      matched.driver_id,
      matched.unit_id,
      vendorId,
      fuelType,
      gallons > 0 ? gallons : null,
      pricePerGallon,
      totalPaid,
      tx.location?.city ?? null,
      tx.location?.state ?? null,
      tx.location?.latitude != null ? Number(tx.location.latitude) : null,
      tx.location?.longitude != null ? Number(tx.location.longitude) : null,
      tx.transaction_id,
      sourceRowHash,
      notes,
      loadExemptionReason,
      // $19 — load_required, the mirror of loadExemptionReason above. Both derive from the SAME
      // resolveLoadId result, so the pair can never contradict itself again.
      loadId != null,
    ]
  );

  const id = insertRes.rows[0]?.id ?? null;
  return { bridged: Boolean(id), fuel_transaction_id: id };
}
