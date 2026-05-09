import { apiRequest } from "./client";

export type BankingTile = {
  id: string;
  operating_company_id: string;
  display_name: string;
  account_type: string;
  tag: string;
  tile_kind: "real" | "virtual";
  current_balance: number;
  uncategorized_count: number;
  color_tag: string;
  is_relay: boolean;
  display_order: number;
  last_txn_date?: string | null;
};

export type PlaidBankAccount = {
  id: string;
  operating_company_id: string;
  institution_name: string | null;
  account_name: string | null;
  account_type: string | null;
  account_mask: string | null;
  current_balance_cents: number;
  available_balance_cents: number;
  currency_code: string;
  sync_status: "pending" | "active" | "disconnected" | "needs_reauth" | "error";
  is_active: boolean;
  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PlaidBankTransaction = {
  id: string;
  transaction_date: string;
  posted_date: string | null;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  plaid_category: string[];
  pending: boolean;
  is_credit: boolean;
  matched_load_id: string | null;
  matched_bill_id: string | null;
  matched_settlement_id: string | null;
  notes: string | null;
  created_at: string;
};

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getBankingKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/banking/dashboard/kpis?${q(companyId)}`);
}

export function getBankingTiles(companyId: string) {
  return apiRequest<{ tiles: BankingTile[] }>(`/api/v1/banking/account-tiles?${q(companyId)}`);
}

export function getBankingRegister(accountId: string, companyId: string) {
  return apiRequest<{ register_rows: Array<Record<string, unknown>> }>(`/api/v1/banking/accounts/${accountId}/register?${q(companyId)}`);
}

export function getBankingUncategorized(companyId: string) {
  return apiRequest<{ transactions: Array<Record<string, unknown>> }>(`/api/v1/banking/transactions/uncategorized?${q(companyId)}`);
}

export function getBankingSuggestions(transactionId: string, companyId: string) {
  return apiRequest<{ suggestions: Array<Record<string, unknown>> }>(
    `/api/v1/banking/transactions/${transactionId}/suggestions?${q(companyId)}`
  );
}

export function categorizeTransaction(
  transactionId: string,
  companyId: string,
  payload: { action_type: string; linked_entity_id?: string; payload?: Record<string, unknown> }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/categorize?${q(companyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function undoCategorization(transactionId: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/undo-categorization?${q(companyId)}`, {
    method: "POST",
  });
}

export function splitTransaction(
  transactionId: string,
  companyId: string,
  lines: Array<{ category: string; amount: number }>
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/split`, {
    method: "POST",
    body: { operating_company_id: companyId, lines },
  });
}

export function getAllAccounts(companyId: string) {
  return apiRequest<{ accounts: Array<Record<string, unknown>> }>(`/api/v1/banking/accounts/all?${q(companyId)}`);
}

export function saveAccountVisibility(
  companyId: string,
  accounts: Array<{ id: string; visible: boolean; display_order: number; tag?: string; is_dip?: boolean }>
) {
  return apiRequest<{ updated_accounts: Array<Record<string, unknown>> }>(`/api/v1/banking/accounts/visibility`, {
    method: "POST",
    body: { operating_company_id: companyId, accounts },
  });
}

export function createManualJe(
  companyId: string,
  payload: { date: string; memo?: string; lines: Array<{ account_id: string; dr_amount: number; cr_amount: number }> }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/banking/manual-je`, {
    method: "POST",
    body: { operating_company_id: companyId, ...payload },
  });
}

export function createPlaidLinkToken(operatingCompanyId: string) {
  return apiRequest<{ link_token: string; expiration: string }>(`/api/v1/banking/plaid/create-link-token`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function exchangePlaidPublicToken(publicToken: string, operatingCompanyId: string) {
  return apiRequest<{ accounts: PlaidBankAccount[] }>(`/api/v1/banking/plaid/exchange-public-token`, {
    method: "POST",
    body: {
      public_token: publicToken,
      operating_company_id: operatingCompanyId,
    },
  });
}

export function getPlaidBankAccounts(operatingCompanyId: string) {
  return apiRequest<{ accounts: PlaidBankAccount[] }>(`/api/v1/banking/plaid/accounts?${q(operatingCompanyId)}`);
}

export function getPlaidBankAccount(id: string, operatingCompanyId: string) {
  return apiRequest<{ account: PlaidBankAccount }>(`/api/v1/banking/plaid/accounts/${id}?${q(operatingCompanyId)}`);
}

export function getPlaidBankTransactions(
  id: string,
  operatingCompanyId: string,
  options: { limit?: number; offset?: number; startDate?: string; endDate?: string } = {}
) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.startDate) params.set("start_date", options.startDate);
  if (options.endDate) params.set("end_date", options.endDate);
  return apiRequest<{ transactions: PlaidBankTransaction[] }>(`/api/v1/banking/plaid/accounts/${id}/transactions?${params.toString()}`);
}

export function syncPlaidBankAccount(bankAccountId: string) {
  return apiRequest<{ ok: boolean; added: number; modified: number; removed: number }>(`/api/v1/admin/plaid/sync-account`, {
    method: "POST",
    body: { bank_account_id: bankAccountId },
  });
}

export function disconnectPlaidBankAccount(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/banking/plaid/accounts/${id}/disconnect`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}
