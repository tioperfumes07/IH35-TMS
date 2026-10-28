import { releaseBankLineMatchesWhere } from "../banking/bank-line-release.js";
import { BANK_LINE_DOCUMENT_POINTER_COLUMNS } from "../banking/bank-line-match-pointer.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
type QueryableClient = { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
export function resolveReversalDate(
  originalDate: string,
  closedThrough: string | null,
  currentDate: string
): string {
  if (closedThrough && originalDate <= closedThrough) return currentDate;
  return originalDate;
}

export function todayIso(): string {
  return companyBusinessDate();
}

export const BANK_TX_UNMATCH_RESET_SQL = `
  UPDATE banking.bank_transactions
     SET status = 'pending_categorization',
         review_state = 'for_review',
         matched_journal_entry_id = NULL,
         matched_load_id = NULL,
         matched_bill_id = NULL,
         matched_settlement_id = NULL,
         matched_expense_id = NULL,
         matched_transfer_id = NULL,
         matched_payment_id = NULL,
         matched_bill_payment_id = NULL,
         matched_factoring_advance_id = NULL,
         matched_fuel_transaction_id = NULL,
         matched_relay_fuel_transaction_id = NULL,
         matched_relay_deposit_id = NULL,
         matched_invoice_id = NULL,
         matched_advance_id = NULL,
         matched_deposit_id = NULL,
         linked_entity_id = NULL,
         category = NULL,
         category_kind = NULL,
         categorization_customer_id = NULL,
         categorization_vendor_id = NULL,
         categorization_gl_account_id = NULL,
         categorization_project_id = NULL,
         categorization_memo = NULL,
         categorization_driver_id = NULL,
         categorization_unit_id = NULL,
         categorization_load_id = NULL,
         -- BANK-ORPHAN-01 live-catch, 2026-09-01: categorization_recover_from_driver is
         -- NOT NULL DEFAULT false on prod (confirmed via information_schema, not assumed) --
         -- setting it to NULL threw "null value ... violates not-null constraint" the first
         -- time this reset actually ran against a row that had it set, which every prior
         -- selftest/guard pass missed because none of them execute real SQL against a live
         -- schema. Reset to its own default, not NULL.
         categorization_recover_from_driver = false,
         categorization_recover_deduction_type = NULL,
         categorization_deduction_id = NULL,
         categorization_item_id = NULL,
         categorization_trailer_id = NULL,
         categorization_class_id = NULL,
         categorization_location = NULL,
         suggested_match_invoice_id = NULL,
         suggested_match_bill_id = NULL,
         categorized_at = NULL,
         updated_at = now()
   WHERE operating_company_id = $1::uuid
`;

// ROUND 363-CC3-B — the release of every match a reset clears is recorded BEFORE the reset, through
// banking.release_bank_line_matches() (bank-line-release.ts). The trail this file used to write after the reset
// (recordVoidedMatches) read the matched_* ids from the UPDATE's RETURNING row — Postgres returns the NEW values, which
// the reset had just set to NULL — so it recorded nothing on every void.

const RELEASABLE_POINTER_COLUMNS = new Set<string>(BANK_LINE_DOCUMENT_POINTER_COLUMNS);
export async function releaseBankLinesNamingDocument(
  client: QueryableClient,
  params: { operatingCompanyId: string; pointerColumn: string; documentId: string },
  actor: { userId: string | null; reason: string }
): Promise<number> {
  if (!RELEASABLE_POINTER_COLUMNS.has(params.pointerColumn)) throw new Error(`not_a_bank_line_pointer: ${params.pointerColumn}`);
  const where = `operating_company_id = $1::uuid AND voided_at IS NULL AND ${params.pointerColumn} = $2::uuid`;
  await releaseBankLineMatchesWhere(client, where, [params.operatingCompanyId, params.documentId], {
    kind: "void",
    reason: actor.reason,
    actorUserId: actor.userId,
  });
  const res = await client.query<{ id: string }>(
    `${BANK_TX_UNMATCH_RESET_SQL} AND voided_at IS NULL AND ${params.pointerColumn} = $2::uuid RETURNING id`,
    [params.operatingCompanyId, params.documentId]
  );
  return res.rows.length;
}

