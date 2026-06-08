import { apiRequest } from "./client";

export type AccountTypeCatalogEntry = {
  id: string;
  code: string;
  accountType: string;
  group: string;
  statement: string;
  normalBalance: string;
  defaultAction: string;
  sortOrder: number;
  detailTypes: Array<{ id: string; name: string; sortOrder: number }>;
};

export type AccountBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: "debit" | "credit";
  opening_balance_cents: number | null;
  period_debits_cents: number;
  period_credits_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
};

export type AccountBalancesReport = {
  accounts: AccountBalanceRow[];
  as_of_date: string;
  from_date: string | null;
  basis: "accrual" | "cash";
  generated_at: string;
};

export function fetchAccountTypeCatalog() {
  return apiRequest<AccountTypeCatalogEntry[]>("/api/v1/accounting/account-type-catalog");
}

export function fetchAccountBalances(operatingCompanyId: string, asOfDate: string) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    as_of_date: asOfDate,
    basis: "accrual",
  });
  return apiRequest<AccountBalancesReport>(`/api/v1/accounting/account-balances?${params.toString()}`);
}

export function deactivateCatalogAccount(accountId: string) {
  return apiRequest<{ id: string; deactivated_at: string; was_already_deactivated: boolean }>(
    `/api/v1/catalogs/accounts/${encodeURIComponent(accountId)}/deactivate`,
    { method: "POST", body: {} }
  );
}
