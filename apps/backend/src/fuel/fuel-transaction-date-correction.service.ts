/**
 * ENGINE: fuel transaction date correction — moves a fuel row's purchase date to the date its source document proves.
 * SCHEDULE: on demand (an AUTH-gated ops runner; Lead 443.72 item 3 is the first caller).
 * WHY: a fuel row is the SOURCE of its expense document; the document, and its journal entry, take their date from the
 *   row (fuel-expense-document.service.ts:270 purchased_at ?? transaction_at). A misdated row could not be corrected:
 *   there is no edit route, and void-and-recreate is refused because fuel_tx_source_row_hash_uk also holds the voided row
 *   (one provider transaction = one row, forever). The correct sequence is: void the DOCUMENT (governed executor,
 *   reversing JE) -> correct the SOURCE date here -> re-mint the document from the source (createExpenseFromFuelTransaction).
 * REFUSES: a row that is voided / archived, a row with ANY live expense document, a row with live fuel_event postings,
 *   a row matched to a live bank line, a missing reason or evidence, a date that is not a real calendar date.
 * WRITES: fuel.fuel_transactions.transaction_at + purchased_at (time of day kept); audit (appendCrudAudit, before/after,
 *   reason, evidence) — the row-level audit trigger records the same change.
 * NEVER: touches an amount, a load, a unit, a driver, a vendor, an account, or a posted row.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type FuelDateCorrectionInput = {
  operatingCompanyId: string;
  fuelTransactionId: string;
  trueDate: string; // YYYY-MM-DD
  reason: string;
  evidence: string; // the document quoted
  actorUserId: string;
};

export type FuelDateCorrectionResult =
  | { outcome: "corrected"; from: string; to: string }
  | { outcome: "refused"; reason: string };

export async function correctFuelTransactionDate(client: DbClient, input: FuelDateCorrectionInput): Promise<FuelDateCorrectionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trueDate) || Number.isNaN(Date.parse(`${input.trueDate}T00:00:00Z`)) ||
      new Date(`${input.trueDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.trueDate) {
    return { outcome: "refused", reason: `not a calendar date: ${input.trueDate}` };
  }
  if (!input.reason.trim() || !input.evidence.trim()) return { outcome: "refused", reason: "a date correction needs a reason and the document quoted" };
  const row = (await client.query<{ day: string | null; voided: boolean; archived: boolean; live_docs: number; live_legs: number; live_bank: number }>(
    `SELECT coalesce(ft.purchased_at, ft.transaction_at)::date::text AS day,
            ft.voided_at IS NOT NULL AS voided, ft.archived_at IS NOT NULL AS archived,
            (SELECT count(*)::int FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL) AS live_docs,
            (SELECT count(*)::int FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
              WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = ft.id::text
                AND je.status = 'posted' AND je.reversed_by_je_id IS NULL) AS live_legs,
            (SELECT count(*)::int FROM banking.bank_transactions b WHERE b.matched_fuel_transaction_id = ft.id) AS live_bank
       FROM fuel.fuel_transactions ft
      WHERE ft.id = $1::uuid AND ft.operating_company_id = $2::uuid
      FOR UPDATE OF ft`,
    [input.fuelTransactionId, input.operatingCompanyId]
  )).rows[0];
  if (!row) return { outcome: "refused", reason: "fuel transaction not found in this company" };
  if (row.voided || row.archived) return { outcome: "refused", reason: "fuel transaction is voided or archived" };
  if (row.live_docs > 0) return { outcome: "refused", reason: `${row.live_docs} live expense document(s) still dated from this row — void the document first` };
  if (row.live_legs > 0) return { outcome: "refused", reason: `${row.live_legs} live fuel_event posting(s) — reverse them first` };
  if (row.live_bank > 0) return { outcome: "refused", reason: "matched to a bank line — unmatch first" };
  if (row.day === input.trueDate) return { outcome: "refused", reason: `already dated ${input.trueDate}` };

  await client.query(
    `UPDATE fuel.fuel_transactions
        SET transaction_at = CASE WHEN transaction_at IS NULL THEN NULL ELSE ($3::date + (transaction_at AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC' END,
            purchased_at   = CASE WHEN purchased_at   IS NULL THEN NULL ELSE ($3::date + (purchased_at AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC' END
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.fuelTransactionId, input.operatingCompanyId, input.trueDate]
  );
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "fuel.transaction.date_corrected",
    {
      resource_type: "fuel.fuel_transactions",
      resource_id: input.fuelTransactionId,
      operating_company_id: input.operatingCompanyId,
      from_date: row.day,
      to_date: input.trueDate,
      reason: input.reason,
      evidence: input.evidence,
    },
    "warning",
    "FUEL-DATE-CORRECTION"
  );
  return { outcome: "corrected", from: row.day ?? "", to: input.trueDate };
}
