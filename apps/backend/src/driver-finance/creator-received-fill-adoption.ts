/**
 * LEAD RULINGS 443.116 #1 (owner design 2026-10-12: costs post daily, as they are received) — the Settlement Creator
 * ADOPTS a card fill that was already received (imported and posted on receipt) instead of recording the purchase a
 * second time. Adoptable only when ALL hold, else the one-receipt rule (443.110 G12) still refuses it by name:
 *   - the live fill for this provider receipt (same company, vendor and product — findLiveFuelByProviderTransactionId)
 *     was RECEIVED (source <> 'manual': an import, never another hand entry);
 *   - it is on THIS settlement's load (a receipt is one load's purchase);
 *   - its expense document is posted and names no settlement yet (settlement_no and source_settlement_ref empty).
 */
import { findLiveFuelByProviderTransactionId } from "../fuel/fuel-provider-reference.js";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export async function findReceivedCardFillToAdopt(
  client: Queryable,
  input: { operatingCompanyId: string; vendorId: string; reference: string | null | undefined; fuelType: string; loadId: string | null },
): Promise<string | null> {
  if (!input.loadId) return null;
  const existing = await findLiveFuelByProviderTransactionId(client, {
    operatingCompanyId: input.operatingCompanyId,
    vendorId: input.vendorId,
    reference: input.reference,
    fuelType: input.fuelType,
  });
  if (!existing || existing.load_id !== input.loadId) return null;
  const res = await client.query(
    `SELECT 1
       FROM fuel.fuel_transactions f
       JOIN accounting.expenses e
         ON e.source_fuel_transaction_id = f.id AND e.operating_company_id = f.operating_company_id
        AND e.voided_at IS NULL AND e.posting_status = 'posted'
      WHERE f.id = $1::uuid AND f.operating_company_id = $2::uuid AND f.voided_at IS NULL
        AND f.source <> 'manual'
        AND e.settlement_no IS NULL AND e.source_settlement_ref IS NULL
      LIMIT 1`,
    [existing.id, input.operatingCompanyId],
  );
  return res.rows.length ? existing.id : null;
}

/**
 * LEAD 443.202 — a WEX ticket has TWO numbers: the settlement (AlwaysTrack PDF) prints the STATION's receipt number
 * (Love's 99010299), the England WEX export prints WEX's own invoice (55714). Measured on settlements 5843–5851: 37 of 37
 * WEX lines differ, so the provider-ID lookup above can never pair a received WEX fill with its settlement line. The
 * same purchase is identified by its SHAPE instead: card WEX, same product, the truck (or the load) it fueled, local day
 * ±1 (5848: printed 10-18, WEX 10-17), the amount (the card charge or the pump retail, to the cent) and the gallons
 * (±0.05; the export rounds to 2 places, the PDF prints 3).
 *
 * Returns the received fill this line ADOPTS (same load, posted, on no settlement) or, when the same purchase was
 * received but may not be adopted here (another load, already on a settlement, not posted), the blocking fill — the
 * caller refuses the line by name. Never a second row for one purchase.
 */
export const SHAPE_ADOPTION_CARDS = new Set(["wex"]);

export type ReceivedCardFillShape = {
  operatingCompanyId: string;
  card: string;
  fuelType: string;
  loadId: string | null;
  unitId: string | null;
  date: string; // YYYY-MM-DD as printed
  amountCents: number;
  gallons: number | null;
};

export async function findReceivedCardFillByShape(
  client: Queryable,
  input: ReceivedCardFillShape,
): Promise<{ adopt: string | null; blocking: { id: string; load_number: string | null; reason: string } | null }> {
  if (!SHAPE_ADOPTION_CARDS.has(input.card) || !(input.amountCents > 0)) return { adopt: null, blocking: null };
  const res = await client.query(
    `SELECT f.id::text AS id, f.load_id::text AS load_id, l.load_number::text AS load_number,
            e.id IS NOT NULL AND e.posting_status = 'posted' AS posted,
            e.settlement_no IS NOT NULL OR e.source_settlement_ref IS NOT NULL AS on_settlement
       FROM fuel.fuel_transactions f
       JOIN catalogs.fuel_card_types ct ON ct.id = f.fuel_card_id AND ct.operating_company_id = f.operating_company_id
                                       AND ct.code = upper($2)
       LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = f.id AND e.operating_company_id = f.operating_company_id
                                      AND e.voided_at IS NULL
       LEFT JOIN mdata.loads l ON l.id = f.load_id AND l.operating_company_id = f.operating_company_id
      WHERE f.operating_company_id = $1::uuid AND f.voided_at IS NULL AND f.source <> 'manual'
        AND f.fuel_type::text = $3
        -- the truck it fueled (or the line's load); with no truck named (the preflight), the shape alone, company-wide
        AND ($5::uuid IS NULL OR f.unit_id = $5::uuid OR f.load_id = $4::uuid)
        AND (f.purchased_at AT TIME ZONE 'America/Chicago')::date BETWEEN $6::date - 1 AND $6::date + 1
        AND $7::bigint IN (round(f.total_cost * 100)::bigint, round(COALESCE(f.gross_cost, -1) * 100)::bigint)
        AND ($8::numeric IS NULL OR f.gallons IS NULL OR abs(f.gallons - $8::numeric) <= 0.05)
      ORDER BY abs((f.purchased_at AT TIME ZONE 'America/Chicago')::date - $6::date), f.created_at
      LIMIT 3`,
    [input.operatingCompanyId, input.card, input.fuelType, input.loadId, input.unitId, input.date, input.amountCents, input.gallons],
  );
  const rows = res.rows as Array<{ id: string; load_id: string | null; load_number: string | null; posted: boolean; on_settlement: boolean }>;
  if (rows.length === 0) return { adopt: null, blocking: null };
  const free = rows.filter((r) => input.loadId && r.load_id === input.loadId && r.posted && !r.on_settlement);
  if (free.length === 1) return { adopt: free[0]!.id, blocking: null };
  const r = rows[0]!;
  const reason = free.length > 1
    ? "two received fills match this line — name the ticket"
    : r.on_settlement ? "it is already on a settlement"
    : !r.posted ? "its expense is not posted"
    : `it is on load ${r.load_number ?? "(none)"}, not this line's load`;
  return { adopt: null, blocking: { id: r.id, load_number: r.load_number, reason } };
}
