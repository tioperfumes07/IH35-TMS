import { apiRequest } from "./client";

export type UndepositedReceipt = {
  kind: "customer_payment" | "factoring_advance";
  id: string;
  display_id: string | null;
  amount_cents: number;
  receipt_date: string | null;
  payee_name: string | null;
  memo: string | null;
};

export type BankDepositSummary = {
  id: string;
  display_id: string;
  deposit_date: string;
  total_receipts_cents: number;
  cash_back_cents: number;
  amount_deposited_cents: number;
  voided_at: string | null;
  journal_entry_id: string | null;
  memo: string | null;
  bank_account_name?: string | null;
};

export type CreateBankDepositBody = {
  operating_company_id: string;
  bank_account_id: string;
  deposit_date: string;
  memo?: string | null;
  reference_number?: string | null;
  payment_ids?: string[];
  factoring_advance_ids?: string[];
  cash_back_cents?: number;
  cash_back_account_id?: string | null;
};

export function listUndepositedReceipts(operatingCompanyId: string) {
  return apiRequest<{ rows: UndepositedReceipt[]; count: number }>(
    `/api/v1/accounting/bank-deposits/undeposited?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function listBankDeposits(operatingCompanyId: string, opts?: { limit?: number; includeVoided?: boolean }) {
  const q = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    limit: String(opts?.limit ?? 50),
  });
  if (opts?.includeVoided) q.set("include_voided", "true");
  return apiRequest<{ rows: BankDepositSummary[]; count: number }>(`/api/v1/accounting/bank-deposits?${q}`);
}

export function createBankDeposit(body: CreateBankDepositBody) {
  return apiRequest<{
    deposit: {
      id: string;
      display_id: string;
      journal_entry_id: string;
      total_receipts_cents: number;
      cash_back_cents: number;
      amount_deposited_cents: number;
    };
  }>("/api/v1/accounting/bank-deposits", { method: "POST", body: JSON.stringify(body) });
}

export function voidBankDeposit(id: string, body: { operating_company_id: string; reason: string }) {
  return apiRequest<{ deposit: { id: string; display_id: string; reversal_journal_entry_id: string | null } }>(
    `/api/v1/accounting/bank-deposits/${encodeURIComponent(id)}/void`,
    { method: "POST", body: JSON.stringify(body) }
  );
}
