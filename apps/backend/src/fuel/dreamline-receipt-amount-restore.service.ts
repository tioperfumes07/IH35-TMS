/**
 * LEAD 443.197 — the narrow audited writer that gives a Dreamline-ADOPTED receipt back its own amounts.
 *
 * Until 443.197 the adoption stamp (stampDreamlineReceiptAdopted) overwrote the adopted Settlement Creator receipt's
 * gross_cost / discount_amount with the statement card's figures, while the card difference ALSO posted on its own
 * (Dr 2510 / Cr Fuel Card Discount). The receipt then read total_cost <> gross_cost − discount_amount. The stamp now
 * writes the marker only; this writer restores what the stamp overwrote, to the receipt's own PRE-STAMP values (the
 * caller reads them from audit.row_changes' old_data of the stamping UPDATE).
 *
 * Narrow by construction: it writes gross_cost and discount_amount ONLY — never total_cost (the posted amount), never a
 * posting, a document or a note — and only on a live fuel row of the company that carries a Dreamline adoption marker
 * and is NOT a row the statement import itself wrote (those keep the card's gross / discount as their own facts). The
 * restored pair must satisfy the fuel-discount invariant: total_cost = coalesce(gross_cost, total_cost) − discount.
 * Any row outside that refuses the whole call (throws; the caller's transaction rolls back). One audit event per row,
 * with before / after, beside the row-level audit trigger.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export const DREAMLINE_RECEIPT_RESTORE_EVENT = "fuel.dreamline_adopted_receipt_amounts_restored";

export type DreamlineReceiptAmountRestore = {
  fuel_transaction_id: string;
  /** The receipt's own pre-stamp gross (null = it never had one; the receipt's total is its gross). */
  gross_cost: string | null;
  /** The receipt's own pre-stamp discount. */
  discount_amount: string;
};

/** Pure: total = coalesce(gross, total) − discount, to the cent. */
export function restoredPairHoldsInvariant(totalCost: string, grossCost: string | null, discountAmount: string): boolean {
  const c = (v: string) => Math.round(Number(v) * 100);
  return c(totalCost) === c(grossCost ?? totalCost) - c(discountAmount);
}

export async function restoreDreamlineAdoptedReceiptAmounts(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; reason: string; restores: DreamlineReceiptAmountRestore[] }
): Promise<Array<{ fuel_transaction_id: string; before: { gross_cost: string | null; discount_amount: string | null }; after: { gross_cost: string | null; discount_amount: string } }>> {
  const done: Array<{ fuel_transaction_id: string; before: { gross_cost: string | null; discount_amount: string | null }; after: { gross_cost: string | null; discount_amount: string } }> = [];
  for (const r of input.restores) {
    const row = (await client.query<{ total_cost: string; gross_cost: string | null; discount_amount: string | null; notes: string | null; voided: boolean }>(
      `SELECT total_cost::text, gross_cost::text, discount_amount::text, notes, voided_at IS NOT NULL AS voided
         FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
      [r.fuel_transaction_id, input.operatingCompanyId]
    )).rows[0];
    if (!row) throw new Error(`dreamline_receipt_restore_refused:${r.fuel_transaction_id}:not_found`);
    if (row.voided) throw new Error(`dreamline_receipt_restore_refused:${r.fuel_transaction_id}:voided`);
    const notes = row.notes ?? "";
    if (!notes.includes("dreamline_efs=")) throw new Error(`dreamline_receipt_restore_refused:${r.fuel_transaction_id}:not_an_adopted_receipt`);
    if (notes.includes("443.142 Dreamline statement")) throw new Error(`dreamline_receipt_restore_refused:${r.fuel_transaction_id}:statement_row`);
    if (!restoredPairHoldsInvariant(row.total_cost, r.gross_cost, r.discount_amount))
      throw new Error(`dreamline_receipt_restore_refused:${r.fuel_transaction_id}:restored_pair_breaks_total(${row.total_cost},${r.gross_cost},${r.discount_amount})`);
    await client.query(
      `UPDATE fuel.fuel_transactions SET gross_cost = $3::numeric, discount_amount = $4::numeric, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [r.fuel_transaction_id, input.operatingCompanyId, r.gross_cost, r.discount_amount]
    );
    const entry = {
      fuel_transaction_id: r.fuel_transaction_id,
      before: { gross_cost: row.gross_cost, discount_amount: row.discount_amount },
      after: { gross_cost: r.gross_cost, discount_amount: r.discount_amount },
    };
    await appendCrudAudit(
      client,
      input.actorUserId,
      DREAMLINE_RECEIPT_RESTORE_EVENT,
      { ...entry, resource_type: "fuel.fuel_transactions", resource_id: r.fuel_transaction_id, operating_company_id: input.operatingCompanyId, reason: input.reason },
      "info",
      "LEAD-443.197"
    );
    done.push(entry);
  }
  return done;
}
