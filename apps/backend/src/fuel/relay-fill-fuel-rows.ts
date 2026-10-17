/**
 * LEAD 443.198 — THE one writer of a Relay fill's fuel RECORDS (fuel.fuel_transactions) from the fill's OWN product lines.
 *
 * Old rule -> new rule -> why:
 *   OLD: the Settlement Creator wrote a Relay fuel line's row from the amount typed off the printed settlement (the PUMP
 *        price, fuel_purchases[].receipt_cents) and wrote no row for a product the settlement did not print (the DEF line
 *        of a diesel + DEF ticket). The fill's posting already read the Relay lines, so the money was right and the
 *        record was wrong: settlements 5839-5842 (2026-10-16) left 24 Relay fills whose live rows did not sum to what
 *        Relay paid (verify-fuel-transactions-per-load: e.g. one fill $1.35 recorded vs $29.84 paid).
 *   NEW: a Relay fill's rows come from integrations.relay_fuel_transaction_lines — one row per product line, at Relay's
 *        DISCOUNTED amount, its gallons and its product (DEF its own row with fuel_type 'def'); Relay's fee (the one fee
 *        rule, relayFillFeeCents) on the first row. The lines must foot to what Relay paid (relayFuelPaidCents) or the
 *        write is refused by name — never a typed amount, never a plug.
 *   WHY: one purchase, one source. The settlement prints what the driver saw at the pump; what the company bought is
 *        what Relay charged, line by line. The record now says the same thing as the posting.
 *
 * source_row_hash is keyed on the Relay LINE ("relay-line:<company>:<line id>"): one live record per Relay line, and a
 * corrected record (void + rewrite, LEAD 443.198 runner) never collides with the voided row's provider hash.
 * Guard: scripts/verify-fuel-transactions-per-load.mjs --static (Creator Relay rows are written here, never from netCents).
 */
import { sameEntityLoadCompanyTrailerSql } from "../accounting/load-trailer.sql.js";
import { relayFillFeeCents, relayFuelPaidCents } from "../integrations/relay-payments/relay-sender-fee-cents.js";
import { FUEL_TYPE_FOR_RELAY_KIND, relayLineKind } from "./relay-product-kind.js";
import { refuseDuplicateProviderTransaction } from "./fuel-provider-reference.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export class RelayFillFuelRowsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RelayFillFuelRowsError";
  }
}

export type RelayFillLineRaw = {
  id: string;
  line_index: number;
  fuel_type: string | null;
  fuel_product_code: string | null;
  fuel_type_description: string | null;
  volume: string | number | null;
  volume_uom: string | null;
  discounted_price_per_unit_cents: string | number | null;
  total_discounted_price_cents: string | number | null;
  fee_amount_cents: string | number | null;
};

export type RelayFillRowPlan = {
  line_id: string;
  line_index: number;
  fuel_type: "diesel" | "def" | "reefer_diesel" | "other";
  gallons: number | null;
  price_per_gallon: number | null;
  total_cents: number;
  fee_cents: number;
};

const isGallons = (uom: string | null) => ["gallons", "gallon", "gal"].includes(String(uom ?? "").trim().toLowerCase());

/**
 * Pure: the fill's rows from its lines. A product line (discounted amount > 0) is one row; the fee goes on the first row.
 * Refuses when the product lines do not foot to `fuelPaidCents`, or when two lines of the fill are the same product
 * (one row per product per ticket — the provider-duplicate rule — so two such lines cannot both be recorded honestly).
 */
export function relayFillRowsFromLines(
  fill: { relay_fill_id: string; transaction_id: string },
  lines: RelayFillLineRaw[],
  amounts: { fuelPaidCents: number; feeCents: number },
): RelayFillRowPlan[] {
  const product = [...lines]
    .filter((l) => Math.round(Number(l.total_discounted_price_cents ?? 0)) > 0)
    .sort((a, b) => a.line_index - b.line_index);
  if (product.length === 0) {
    throw new RelayFillFuelRowsError("relay_fill_no_product_lines", `Relay transaction ${fill.transaction_id} has no product line with an amount — nothing to record.`);
  }
  const plans: RelayFillRowPlan[] = product.map((l, i) => {
    const total = Math.round(Number(l.total_discounted_price_cents));
    const vol = l.volume == null ? null : Number(l.volume);
    const gallons = vol != null && Number.isFinite(vol) && vol > 0 && isGallons(l.volume_uom) ? vol : null;
    const ppuCents = l.discounted_price_per_unit_cents == null ? null : Number(l.discounted_price_per_unit_cents);
    const ppg = ppuCents != null && Number.isFinite(ppuCents) && ppuCents > 0
      ? ppuCents / 100
      : gallons ? Math.round((total / gallons) * 100) / 10000 : null;
    return {
      line_id: l.id,
      line_index: l.line_index,
      fuel_type: FUEL_TYPE_FOR_RELAY_KIND[relayLineKind(l)],
      gallons,
      price_per_gallon: ppg,
      total_cents: total,
      fee_cents: i === 0 ? Math.max(0, Math.round(amounts.feeCents)) : 0,
    };
  });
  const sum = plans.reduce((s, p) => s + p.total_cents, 0);
  if (sum !== Math.round(amounts.fuelPaidCents)) {
    throw new RelayFillFuelRowsError(
      "relay_fill_lines_do_not_foot",
      `Relay transaction ${fill.transaction_id}: its product lines sum to ${sum} cents but Relay paid ${amounts.fuelPaidCents} — the record is never written from a different amount.`,
    );
  }
  const seen = new Set<string>();
  for (const p of plans) {
    if (seen.has(p.fuel_type)) {
      throw new RelayFillFuelRowsError("relay_fill_product_repeated", `Relay transaction ${fill.transaction_id} carries two ${p.fuel_type} lines — one row per product per ticket; resolve the fill first.`);
    }
    seen.add(p.fuel_type);
  }
  return plans;
}

/** Read the fill, its live lines and Relay's paid / fee by the one paid rule, and plan its rows. */
export async function planRelayFillFuelRows(client: Queryable, operatingCompanyId: string, relayFillId: string): Promise<{ transaction_id: string; plans: RelayFillRowPlan[]; fuel_paid_cents: number; fee_cents: number }> {
  const fill = (await client.query<{ transaction_id: string; total_amount_paid_cents: string; fees: unknown[] | null; ingest_source: string | null }>(
    `SELECT transaction_id, total_amount_paid_cents::text, fees, ingest_source
       FROM integrations.relay_fuel_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND is_active`,
    [relayFillId, operatingCompanyId],
  )).rows[0];
  if (!fill) throw new RelayFillFuelRowsError("relay_fill_not_ingested", `Relay fill ${relayFillId} is not a live Relay fill of this company.`);
  const lines = (await client.query<RelayFillLineRaw>(
    `SELECT id::text, line_index, fuel_type, fuel_product_code, fuel_type_description, volume::text, volume_uom,
            discounted_price_per_unit_cents::text, total_discounted_price_cents::text, fee_amount_cents::text
       FROM integrations.relay_fuel_transaction_lines
      WHERE relay_fuel_transaction_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND is_active
      ORDER BY line_index`,
    [relayFillId, operatingCompanyId],
  )).rows;
  const productCents = lines.reduce((s, l) => s + Math.max(0, Math.round(Number(l.total_discounted_price_cents ?? 0))), 0);
  const lineFees = lines.map((l) => Number(l.fee_amount_cents ?? 0));
  const fee = relayFillFeeCents({ transaction_id: fill.transaction_id, fees: fill.fees, line_fee_amount_cents: lineFees });
  const paid = relayFuelPaidCents({
    transaction_id: fill.transaction_id,
    stored_paid_cents: Number(fill.total_amount_paid_cents),
    product_lines_cents: productCents,
    fees: fill.fees,
    line_fee_amount_cents: lineFees,
    ingest_source: fill.ingest_source,
  });
  const plans = relayFillRowsFromLines({ relay_fill_id: relayFillId, transaction_id: fill.transaction_id }, lines, { fuelPaidCents: paid.fuel_paid_cents, feeCents: fee });
  return { transaction_id: fill.transaction_id, plans, fuel_paid_cents: paid.fuel_paid_cents, fee_cents: fee };
}

export type WriteRelayFillFuelRowsInput = {
  operatingCompanyId: string;
  relayFillId: string;
  vendorId: string;
  loadId: string | null;
  driverId: string | null;
  unitId: string | null;
  /** The settlement's trailer — recorded on a reefer row only when this company owns / leases a reefer (U25). */
  reeferTrailerId: string | null;
  reference: string | null;
  purchasedAt: string;
  locationCity: string | null;
  loadExemptionReason: string | null;
  actorUserId: string;
  sourceDocId: string | null;
  notes: string | null;
};

/** Write the fill's rows (one per product line) and return them. The caller links / posts through the fill as before. */
export async function writeRelayFillFuelRows(
  client: Queryable,
  input: WriteRelayFillFuelRowsInput,
): Promise<Array<RelayFillRowPlan & { id: string }>> {
  const { plans } = await planRelayFillFuelRows(client, input.operatingCompanyId, input.relayFillId);
  // ROUND 367.2 — one provider transaction is one purchase per product line: every row is refused by name BEFORE any
  // INSERT when the ticket's product is already recorded (the database refuses it too, 202615410930).
  for (const p of plans) {
    await refuseDuplicateProviderTransaction(client, { operatingCompanyId: input.operatingCompanyId, vendorId: input.vendorId, reference: input.reference, fuelType: p.fuel_type });
  }
  const out: Array<RelayFillRowPlan & { id: string }> = [];
  for (const p of plans) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO fuel.fuel_transactions (
          operating_company_id, vendor_id, load_id, driver_id, unit_id,
          fuel_type, gallons, price_per_gallon, total_cost, fee_amount,
          purchased_at, transaction_at, transaction_reference, location_city,
          source, load_required, load_exemption_reason, created_by_user_id, source_row_hash, trailer_id,
          source_doc_id, fuel_card_id, notes, relay_fuel_transaction_id
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6, $7, $8, $9, $10,
          $11::timestamptz, $11::timestamptz, $12, $13,
          'manual', $14, $15, $16::uuid, $17,
          CASE WHEN $6 = 'reefer_diesel'
               THEN (SELECT eq.id FROM mdata.equipment eq WHERE eq.id = $18::uuid AND eq.equipment_type ~* 'reefer'
                       AND (eq.owner_company_id = $1::uuid OR eq.currently_leased_to_company_id = $1::uuid))
               ELSE ${sameEntityLoadCompanyTrailerSql("$3::uuid", "$1::uuid")} END,
          $19::uuid,
          (SELECT ct.id FROM catalogs.fuel_card_types ct WHERE ct.operating_company_id = $1::uuid AND ct.code = 'RELAY' AND ct.is_active),
          $20, $21::uuid
        )
        RETURNING id::text`,
      [
        input.operatingCompanyId, input.vendorId, input.loadId, input.driverId, input.unitId,
        p.fuel_type, p.gallons, p.price_per_gallon, p.total_cents / 100, p.fee_cents / 100,
        input.purchasedAt, input.reference, input.locationCity,
        Boolean(input.loadId), input.loadId ? null : input.loadExemptionReason, input.actorUserId,
        `relay-line:${input.operatingCompanyId}:${p.line_id}`,
        p.fuel_type === "reefer_diesel" ? input.reeferTrailerId : null,
        input.sourceDocId, input.notes, input.relayFillId,
      ],
    );
    out.push({ ...p, id: r.rows[0]!.id });
  }
  return out;
}
