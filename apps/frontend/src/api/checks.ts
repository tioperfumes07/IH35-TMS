// R-154 §4/§5 (PR 4/7) — frontend client for the check engine's core CRUD routes (backend: PR 3/7,
// apps/backend/src/accounting/checks/checks.routes.ts). Body objects only -- apiRequest() already
// JSON.stringifies; a caller stringifying here double-encodes (the exact bug PR 1/7 of this round
// found and fixed in banking.ts's acceptBankReconMatchSet).
import { apiRequest } from "./client";

export type CheckPayeeKind = "vendor" | "driver" | "customer" | "employee";

export type CheckLineInput = {
  line_kind: "category" | "item";
  category_kind?: string | null;
  category_code?: string | null;
  item_id?: string | null;
  amount_cents: number;
  description?: string | null;
  billable_customer_uuid?: string | null;
  load_id?: string | null;
  // R-172 step 3 -- per-line fleet linkage (accounting.expense_lines, 202614360000). Omitted/null
  // falls back to the check header's own value for that dimension.
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  linked_work_order_uuid?: string | null;
  // R-172 step 4 -- item grid Qty/Rate (R-83 owner ruling: amount is computed, never typed). Required
  // together for an item line; the server recomputes amount_cents from these itself.
  quantity?: number | null;
  rate_cents?: number | null;
  unit_of_measure?: string | null;
};

export type CreateCheckInput = {
  operating_company_id: string;
  bank_account_id: string;
  payee_kind: CheckPayeeKind;
  payee_id: string;
  check_date: string;
  print_later: boolean;
  check_number?: string | null;
  memo?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  driver_id?: string | null;
  load_id?: string | null;
  linked_work_order_uuid?: string | null;
  insurance_claim_id?: string | null;
  legal_matter_id?: string | null;
  class_id?: string | null;
  recover_from_driver?: boolean;
  tags?: string[];
  attachment_draft_id?: string | null;
  remit_to_address?: CheckRemitToAddress | null;
  lines: CheckLineInput[];
};

export type CreateCheckResult = {
  id: string;
  check_number: string | null;
  print_status: "not_set" | "need_to_print";
  payee_kind: CheckPayeeKind;
  print_on_check_name: string;
  total_amount_cents: number;
  // R-172 step 7 -- honest posting outcome; see check-create.service.ts's CreateCheckResult.
  posting_status: "posted" | "unposted";
  journal_entry_id: string | null;
};

export function createCheck(input: CreateCheckInput) {
  return apiRequest<CreateCheckResult>(`/api/v1/checks`, { method: "POST", body: input });
}

export type CheckListRow = {
  id: string;
  check_number: string | null;
  print_status: "not_set" | "need_to_print" | "print_complete";
  payee_kind: CheckPayeeKind;
  print_on_check_name: string;
  transaction_date: string;
  total_amount_cents: number;
  bank_account_id: string;
  status: "draft" | "posted" | "void";
  voided_at: string | null;
};

export type CheckReverseLinkFilter = {
  bank_account_id?: string;
  // R-154.1 §D reverse-link filters -- one call, reused by every detail-page Transactions/Costs tab
  // that wires itself to this endpoint (vendor/driver/customer/unit/trailer/load).
  vendor_id?: string;
  driver_id?: string;
  customer_id?: string;
  unit_id?: string;
  trailer_id?: string;
  load_id?: string;
  limit?: number;
  offset?: number;
};

export function listChecks(operatingCompanyId: string, options: CheckReverseLinkFilter = {}) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  for (const key of ["bank_account_id", "vendor_id", "driver_id", "customer_id", "unit_id", "trailer_id", "load_id"] as const) {
    const value = options[key];
    if (value) q.set(key, value);
  }
  if (options.limit != null) q.set("limit", String(options.limit));
  if (options.offset != null) q.set("offset", String(options.offset));
  return apiRequest<{ rows: CheckListRow[]; limit: number; offset: number }>(`/api/v1/checks?${q.toString()}`);
}

export function getCheckNextNumber(operatingCompanyId: string, bankAccountId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, bank_account_id: bankAccountId });
  return apiRequest<{ next_check_number: string | null }>(`/api/v1/checks/next-number?${q.toString()}`);
}

// R-172 step 6 -- "warn on a duplicate check number for the same bank account" (spec §6).
export function getCheckNumberStatus(operatingCompanyId: string, bankAccountId: string, checkNumber: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, bank_account_id: bankAccountId, check_number: checkNumber });
  return apiRequest<{ in_use: boolean }>(`/api/v1/checks/check-number-status?${q.toString()}`);
}

export type CheckDetail = CheckListRow & {
  remit_to_address: Record<string, string | null> | null;
  tags: string[] | null;
  memo: string | null;
  vendor_uuid: string | null;
  driver_uuid: string | null;
  payee_customer_uuid: string | null;
  unit_id: string | null;
  trailer_id: string | null;
  load_id: string | null;
  posting_status: string;
  journal_entry_id: string | null;
  void_reason: string | null;
  voided_by_user_id: string | null;
  /** B-1 §5 — bank feed hop via matched_expense_id (check IS an expense). */
  matched_bank_transaction_id?: string | null;
  matched_bank_transaction_date?: string | null;
  matched_bank_transaction_description?: string | null;
  matched_bank_transaction_amount_cents?: string | number | null;
};

export type CheckDetailLine = {
  id: string;
  line_sequence: number;
  amount_cents: number;
  description: string | null;
  expense_account_uuid: string | null;
  item_id: string | null;
  billable_customer_uuid: string | null;
  load_id: string | null;
  driver_id: string | null;
  unit_id: string | null;
  trailer_id: string | null;
  linked_work_order_uuid: string | null;
  quantity: string | number | null;
  rate_cents: string | number | null;
  unit_of_measure: string | null;
};

export function getCheck(operatingCompanyId: string, id: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ check: CheckDetail; lines: CheckDetailLine[] }>(`/api/v1/checks/${id}?${q.toString()}`);
}

// R-172 step 2 -- live payee preview (name + mailing address) so the Write Check header can auto-fill
// an editable remit-to-address block on payee change, without waiting for save.
export type CheckRemitToAddress = {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export type ResolvedCheckPayeePreview = {
  payee_kind: CheckPayeeKind;
  payee_id: string;
  print_on_check_name: string;
  remit_to_address: CheckRemitToAddress | null;
  eligible_1099: boolean | null;
  vendor_driver_id: string | null;
  // R-172 step 5 -- the mdata.vendors id this payee's open bills live under (the payee's own id for a
  // vendor; the driver's A/P vendor bridge for a driver; null for customer/employee, who have none).
  vendor_id_for_bills: string | null;
};

export function resolveCheckPayeePreview(operatingCompanyId: string, payeeKind: CheckPayeeKind, payeeId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, payee_kind: payeeKind, payee_id: payeeId });
  return apiRequest<ResolvedCheckPayeePreview>(`/api/v1/checks/resolve-payee?${q.toString()}`);
}

// R-172 step 5 -- "Add" on the payee's open bills turns the check into a Bill Payment (Check): a
// genuinely different document (accounting.bill_payments, Dr A/P / Cr bank), not an accounting.expenses
// row, so it is its own endpoint rather than a mode of createCheck().
export type PayCheckBillsInput = {
  operating_company_id: string;
  payee_kind: "vendor" | "driver";
  payee_id: string;
  bank_account_id: string;
  check_date: string;
  check_number: string;
  memo?: string | null;
  applications: Array<{ bill_id: string; amount_cents: number }>;
};

export type PayCheckBillsResult = { payment_batch_id: string; bill_payment_ids: string[] };

export function payCheckBills(input: PayCheckBillsInput) {
  return apiRequest<PayCheckBillsResult>(`/api/v1/checks/pay-bills`, { method: "POST", body: input });
}

// R-172 step 8 -- More menu: Void (PR 6/7's real voidCheck(), not a new reversal engine).
export type VoidCheckResult = {
  voided_at: string;
  reversal_journal_entry_id: string | null;
};

export function voidCheckApi(operatingCompanyId: string, id: string, reason: string) {
  return apiRequest<VoidCheckResult>(`/api/v1/checks/${id}/void`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, reason },
  });
}

export type UnvoidCheckResult = {
  reinstated_at: string;
  status: string;
  posting_status: string;
};

export function unvoidCheckApi(operatingCompanyId: string, id: string, reason: string) {
  return apiRequest<UnvoidCheckResult>(`/api/v1/checks/${id}/unvoid`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, reason },
  });
}

export type CheckStockSettings = {
  bank_account_id: string;
  operating_company_id: string;
  next_check_number: string | null;
  check_type: "voucher" | "standard";
  offset_x_mm: string;
  offset_y_mm: string;
  print_company_address: boolean;
};

export function getCheckStockSettings(operatingCompanyId: string, bankAccountId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, bank_account_id: bankAccountId });
  return apiRequest<{ settings: CheckStockSettings | null }>(`/api/v1/checks/stock-settings?${q.toString()}`);
}

export function putCheckStockSettings(input: {
  operating_company_id: string;
  bank_account_id: string;
  next_check_number: string | null;
  check_type?: "voucher" | "standard";
}) {
  return apiRequest<{ settings: CheckStockSettings }>(`/api/v1/checks/stock-settings`, {
    method: "PUT",
    body: input,
  });
}

export type PrintQueueRow = {
  id: string;
  print_on_check_name: string;
  transaction_date: string;
  total_amount_cents: number;
  memo: string | null;
};

export function listCheckPrintQueue(operatingCompanyId: string, bankAccountId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, bank_account_id: bankAccountId });
  return apiRequest<{ rows: PrintQueueRow[] }>(`/api/v1/checks/print-queue?${q.toString()}`);
}

export type PrintBatchResult = {
  print_batch_id: string;
  assignments: Array<{ check_id: string; check_number: string }>;
};

export function assignCheckPrintBatch(input: {
  operating_company_id: string;
  bank_account_id: string;
  check_type: "voucher" | "standard";
  ids: string[];
}) {
  return apiRequest<PrintBatchResult>(`/api/v1/checks/print-batch`, { method: "POST", body: input });
}

export function confirmCheckPrintBatch(
  operatingCompanyId: string,
  printBatchId: string,
  input: { all_ok: true } | { reprint_from_number: string }
) {
  return apiRequest<{ status: "confirmed" | "reprinting"; spoiled_check_ids: string[] }>(
    `/api/v1/checks/print-batch/${printBatchId}/confirm`,
    {
      method: "POST",
      body: { operating_company_id: operatingCompanyId, ...input },
    }
  );
}
