import { apiRequest } from "./client";

export type PrepaidAmortRow = {
  id: string;
  period_number: number;
  period_date: string;
  amount_cents: number;
  remaining_balance_cents: number;
  posted: boolean;
  posted_at: string | null;
  posted_journal_entry_id: string | null;
};

export type PrepaidJeLine = { account_id: string; debit_cents: number; credit_cents: number; memo: string };

export type PrepaidJePreview = {
  posting_enabled: boolean;
  purchase_je: { lines: PrepaidJeLine[]; balanced: boolean } | null;
  amortization_je_template: { lines: PrepaidJeLine[]; balanced: boolean } | null;
};

export type PrepaidAssetListItem = {
  id: string;
  asset_number: string | null;
  description: string;
  purchase_date: string;
  start_date: string;
  end_date: string;
  total_amount_cents: number;
  periods: number;
  period_amount_cents: number;
  remainder_cents: number;
  status: string;
  posting_status: string;
  posted_at: string | null;
  created_at: string;
  amortized_cents: number;
  pending_periods: number;
};

export type PrepaidAssetDetail = PrepaidAssetListItem & {
  asset_account_id: string | null;
  expense_account_id: string | null;
  payment_account_id: string | null;
  purchase_je_id: string | null;
  schedule: PrepaidAmortRow[];
  je_preview: PrepaidJePreview;
};

export type PrepaidList = { total: number; limit: number; offset: number; items: PrepaidAssetListItem[] };

export function getPrepaidExpenses(input: {
  operating_company_id: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.status) q.set("status", input.status);
  if (input.date_from) q.set("date_from", input.date_from);
  if (input.date_to) q.set("date_to", input.date_to);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<PrepaidList>(`/api/v1/accounting/prepaid-expenses?${q}`);
}

export function getPrepaidExpenseDetail(id: string, operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<PrepaidAssetDetail>(`/api/v1/accounting/prepaid-expenses/${id}?${q}`);
}

export function createPrepaidExpense(body: {
  operating_company_id: string;
  description: string;
  asset_number?: string;
  vendor_uuid?: string;
  purchase_date: string;
  start_date: string;
  periods: number;
  total_amount_cents: number;
  asset_account_id?: string;
  expense_account_id?: string;
  payment_account_id?: string;
}) {
  return apiRequest<PrepaidAssetDetail>("/api/v1/accounting/prepaid-expenses", { method: "POST", body });
}
