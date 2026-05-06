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
