/**
 * ENG-MATCH — Match is a live document pointer, never a CATEGORIZE-account null
 * and never the For-review worklist bucket alone.
 *
 * ROUND 368.2 family + deposit (ROUND 373.4). Split / transfer status is a match.
 * A missing GL mapping is CATEGORIZE. The worklist bucket is not the match predicate.
 */

export const BANK_LINE_DOCUMENT_POINTER_COLUMNS = [
  "matched_advance_id",
  "matched_bill_id",
  "matched_bill_payment_id",
  "matched_deposit_id",
  "matched_expense_id",
  "matched_factoring_advance_id",
  "matched_fuel_transaction_id",
  "matched_invoice_id",
  "matched_journal_entry_id",
  "matched_load_id",
  "matched_payment_id",
  "matched_relay_fuel_transaction_id",
  "matched_settlement_id",
  "matched_transfer_id",
] as const;

export type BankLineDocumentPointerColumn = (typeof BANK_LINE_DOCUMENT_POINTER_COLUMNS)[number];

function qualify(alias: string | undefined, column: string): string {
  return alias ? `${alias}.${column}` : column;
}

/** True when the bank line names a live document or is a split/transfer. */
export function bankLineHasLiveDocumentPointerSql(alias?: string): string {
  const cols = BANK_LINE_DOCUMENT_POINTER_COLUMNS.map((c) => qualify(alias, c)).join(",\n      ");
  return `(
    num_nonnulls(
      ${cols}
    ) > 0
    OR ${qualify(alias, "status")} IN ('split', 'transfer')
    OR ${qualify(alias, "transfer_kind")} IS NOT NULL
  )`;
}

/** True when the bank line still needs Match (CATEGORIZE-account null is not unmatched). */
export function bankLineIsUnmatchedSql(alias?: string): string {
  return `NOT ${bankLineHasLiveDocumentPointerSql(alias)}`;
}

export function bankLinePointerSelectSql(alias?: string): string {
  const q = (column: string) => (alias ? `${alias}.${column}` : column);
  const cols = BANK_LINE_DOCUMENT_POINTER_COLUMNS.map((c) => `${q(c)}::text AS ${c}`);
  return [q("status"), q("transfer_kind"), ...cols].join(",\n        ");
}

export function bankLineHasLiveDocumentPointer(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false;
  for (const column of BANK_LINE_DOCUMENT_POINTER_COLUMNS) {
    const value = row[column];
    if (value != null && value !== "") return true;
  }
  const status = String(row.status ?? "");
  if (status === "split" || status === "transfer") return true;
  if (row.transfer_kind != null && row.transfer_kind !== "") return true;
  return false;
}
