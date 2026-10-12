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
