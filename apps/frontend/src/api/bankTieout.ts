import { apiRequest } from "./client";

/** ROUND 313 BANK-TIEOUT-01. */
export type BankTieout = {
  bank_account_id: string;
  label: string;
  ledger_account_id: string | null;
  tieout_date: string;
  feed_balance_cents: number;
  feed_synced_at: string | null;
  gl_balance_cents: number | null;
  diff_cents: number | null;
  feed_only_cents: number;
  feed_only_count: number;
  gl_only_cents: number;
  gl_only_count: number;
  unexplained_cents: number | null;
  tolerance_cents: number;
  status: "tied" | "explained" | "unexplained" | "no_gl_account";
  explained_by: { stale_feed?: { last_synced_at: string | null; hours: number } | null };
};
export type BankTieoutDrill = {
  ledger_account_id: string | null;
  feed_only: Array<{
    bank_transaction_id: string;
    transaction_date: string;
    description: string | null;
    status: string;
    signed_cents: number;
    matched_factoring_advance_id?: string | null;
    factoring_purchase_id?: string | null;
  }>;
  gl_only: Array<{ journal_entry_id: string; entry_date: string; memo: string | null; source_transaction_type: string | null; source_transaction_id: string | null; signed_cents: number }>;
};
const q = (c: string) => new URLSearchParams({ operating_company_id: c }).toString();
export function getBankTieout(companyId: string, bankAccountId: string) {
  return apiRequest<{ tieout: BankTieout | null; history: Array<Record<string, unknown>> }>(`/api/v1/banking/accounts/${bankAccountId}/tieout?${q(companyId)}`);
}
export function getBankTieoutDrill(companyId: string, bankAccountId: string) {
  return apiRequest<BankTieoutDrill>(`/api/v1/banking/accounts/${bankAccountId}/tieout/drill?${q(companyId)}`);
}
