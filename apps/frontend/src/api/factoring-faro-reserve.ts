// Lead 2026-10-02 FARO-REPORTS-ARE-THE-BANK-FEED — the two Faro reserve registers: report import (owner runs it) and the
// per-entry posters.
import { apiRequest } from "./client";

export type FaroRegister = "escrow" | "cash";
export type FaroEntryKind = "escrow_held" | "escrow_to_cash" | "schedule_fee" | "short_pay" | "rsv_deposit" | "client_payable";

export type FaroReserveEntry = {
  id: string;
  register: FaroRegister;
  entry_kind: FaroEntryKind;
  faro_entry_id: string | null;
  entry_date: string;
  amount_cents: number;
  running_balance_cents: number | null;
  faro_invoice_number: string | null;
  po_ref: string | null;
  debtor_name: string | null;
  pmt_ref: string | null;
  note: string;
  counterparty: string | null;
  bank_transaction_id: string | null;
  journal_entry_id: string | null;
  posted_at: string | null;
  invoice_id: string | null;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  purchase_id: string | null;
  purchase_display_id: string | null;
  short_pay_resolution?: "written_down" | "kept_open" | null;
  short_pay_reason?: string | null;
  short_pay_credit_memo_id?: string | null;
  short_pay_resolution_journal_entry_id?: string | null;
};

/** Owner ruling 2026-10-02 — short-pay reasons (same keys as the server's SHORT_PAY_REASONS). */
export const SHORT_PAY_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "billing_error", label: "Our billing error (billing adjustment)" },
  { value: "rate_dispute", label: "Rate or accessorial dispute" },
  { value: "service_failure", label: "Service failure / late delivery" },
  { value: "paperwork", label: "Missing or invalid paperwork" },
  { value: "osd", label: "OS&D deducted from freight" },
  { value: "detention_denied", label: "Detention / layover denied" },
  { value: "penalty", label: "Penalty / fine assessed by customer (customer claim)" },
  { value: "agreed_concession", label: "Agreed concession / quick-pay discount" },
  { value: "unknown", label: "Unknown / backup not received" },
  { value: "bad_debt", label: "Bad debt" },
];

export function resolveFaroShortPay(
  companyId: string,
  entryId: string,
  body: { resolution: "written_down" | "kept_open"; reason?: string; note?: string }
) {
  return apiRequest<{ entry_id: string; resolution: string; credit_memo_id?: string; journal_entry_id?: string }>(
    `/api/v1/factoring/faro-reserve-entries/${entryId}/short-pay-resolution`,
    { method: "POST", body: { operating_company_id: companyId, ...body } }
  );
}

export type FaroImportRejected = { line: number; faro_entry_id: string | null; reason: string; detail?: string };
export type FaroImportPreview = {
  register: FaroRegister;
  rows: Array<{ line: number; entry_kind: FaroEntryKind; amount_cents: number; already_imported: boolean; invoice_id: string | null; faro_invoice_number: string | null }>;
  rejected: FaroImportRejected[];
  beginning_balance_cents: number | null;
  ending_balance_cents: number | null;
  new_count: number;
  unresolved_invoice_count: number;
};

export async function listFaroReserveEntries(companyId: string, register: FaroRegister) {
  const r = await apiRequest<{ bank_account_id: string; rows: FaroReserveEntry[] }>(
    `/api/v1/factoring/faro-reserve-entries?${new URLSearchParams({ operating_company_id: companyId, register })}`
  );
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed Faro reserve entries response");
  return r;
}

export function getFaroReserveEntry(companyId: string, entryId: string) {
  return apiRequest<{ id: string; register: FaroRegister; bank_account_id: string }>(
    `/api/v1/factoring/faro-reserve-entries/${entryId}?${new URLSearchParams({ operating_company_id: companyId })}`
  );
}

export function previewFaroReserveReport(companyId: string, register: FaroRegister, csvText: string) {
  return apiRequest<FaroImportPreview>(`/api/v1/factoring/faro-reserve-report/preview`, {
    method: "POST",
    body: { operating_company_id: companyId, register, csv_text: csvText },
  });
}

export function commitFaroReserveReport(companyId: string, register: FaroRegister, csvText: string) {
  return apiRequest<{ register: FaroRegister; imported: number; already_imported: number; rejected: FaroImportRejected[]; batch_ref: string }>(
    `/api/v1/factoring/faro-reserve-report/commit`,
    { method: "POST", body: { operating_company_id: companyId, register, csv_text: csvText } }
  );
}

export type FaroPostResult =
  | { entry_id: string; journal_entry_id: string; paired_entry_id?: string }
  | { entry_id: string; status: "interest_accrual_awaiting_approval"; interest_run_id: string; interest_due_cents: number };

export function postFaroReserveEntry(companyId: string, entryId: string) {
  return apiRequest<FaroPostResult>(
    `/api/v1/factoring/faro-reserve-entries/${entryId}/post`,
    { method: "POST", body: { operating_company_id: companyId } }
  );
}
