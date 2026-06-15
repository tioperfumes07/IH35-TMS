import { apiRequest } from "./client";

export type AccountRegisterRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  type: string;
  reference: string | null;
  memo: string | null;
  description: string | null;
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
