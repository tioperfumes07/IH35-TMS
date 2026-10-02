import { apiRequest } from "./client";

export type AccountRegisterReconcileStatus = "" | "C" | "R";

export type AccountRegisterRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  type: string;
  source_transaction_type: string | null;
  // ACCT-REGISTER-SOURCEROUTE-UUID-REGRESSION: `reference` is a human document id (bill_number,
  // invoice display_id, ...) since ACCT-F5426 — never pass it to sourceRoute()/hrefs. This raw
  // source_transaction_id UUID is the one drill-through routing needs.
  source_transaction_id: string | null;
  reference: string | null;
  payee: string | null;
  memo: string | null;
  description: string | null;
  split_account: string | null;
  class_name: string | null;
  /** B-1 ✓ — blank / C / R */
  reconcile_status: AccountRegisterReconcileStatus;
  /** True when C/R is from a bank-feed match (blanking requires unmatch). */
  cleared_by_bank_match: boolean;
  /** B-1 📎 count from docs.file_links on the source document */
  attachment_count: number;
  /** Bank categorization location when present; otherwise null. */
  location: string | null;
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number;
};

export type AccountRegisterReport = {
  account: {
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    normal_balance: "debit" | "credit";
  };
  from_date: string;
  to_date: string;
  opening_balance_cents: number;
  closing_balance_cents: number;
  /** Feed-side balance when a banking.bank_accounts row maps to this GL; null otherwise. */
  bank_balance_cents: number | null;
  bank_account_id: string | null;
  /** Last closed reconciliation period_end (YYYY-MM-DD), or null. */
  reconciled_through: string | null;
  total_debit_cents: number;
  total_credit_cents: number;
  transaction_count: number;
  rows: AccountRegisterRow[];
  generated_at: string;
};

export function getAccountRegister(input: {
  operating_company_id: string;
  account_id: string;
  from_date: string;
  to_date: string;
  search?: string;
  type?: string;
}) {
  const q = new URLSearchParams({
    operating_company_id: input.operating_company_id,
    account_id: input.account_id,
    from_date: input.from_date,
    to_date: input.to_date,
  });
  if (input.search) q.set("search", input.search);
  if (input.type) q.set("type", input.type);
  return apiRequest<AccountRegisterReport>(`/api/v1/accounting/account-register?${q.toString()}`);
}

/** B-1b — toggle ✓ blank↔C. R locked; bank-match C refuses blank. */
export function toggleAccountRegisterCleared(input: {
  operating_company_id: string;
  posting_id: string;
  cleared: boolean;
}) {
  return apiRequest<{
    posting_id: string;
    reconcile_status: AccountRegisterReconcileStatus;
    cleared_by_bank_match: boolean;
    register_cleared: boolean;
  }>(`/api/v1/accounting/account-register/toggle-cleared`, {
    method: "POST",
    body: input,
  });
}

/** B-1c — inline Save for memo + location. Date/payee/amount/account → open_original_document. */
export function saveAccountRegisterInline(input: {
  operating_company_id: string;
  posting_id: string;
  memo?: string | null;
  location?: string | null;
  requires_original_document?: boolean;
}) {
  return apiRequest<{ posting_id: string; memo: string | null; location: string | null }>(
    `/api/v1/accounting/account-register/inline-save`,
    {
      method: "POST",
      body: input,
    }
  );
}
