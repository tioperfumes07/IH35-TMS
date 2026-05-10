import { apiRequest, apiRequestFormData } from "./client";

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

export type ReconciliationSession = {
  id: string;
  bank_account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_cents: number;
  book_balance_cents: number | null;
  variance_cents: number | null;
  status: "open" | "reconciled" | "disputed";
  reconciled_by_user_id: string | null;
  reconciled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReconciliationWorkspacePayload = {
  session: ReconciliationSession;
  matched_transactions: PlaidBankTransaction[];
  unmatched_transactions: PlaidBankTransaction[];
  candidates: {
    loads: Array<{ id: string; event_date: string; event_type: "load" }>;
    bills: Array<{ id: string; event_date: string; event_type: "bill" }>;
    settlements: Array<{ id: string; event_date: string; event_type: "settlement" }>;
  };
  summary: {
    statement_balance_cents: number;
    matched_credits_cents: number;
    matched_debits_cents: number;
    book_balance_cents: number;
    variance_cents: number;
  };
};

export type QboSyncQueueStats = {
  pending: number;
  in_flight: number;
  synced: number;
  failed: number;
  blocked: number;
  average_sync_ms: number;
  last_successful_sync_at: string | null;
};

export type QboSyncQueueItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  sync_status: "pending" | "in_flight" | "synced" | "failed" | "blocked";
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  updated_at: string;
  next_attempt_at: string;
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

export function getReconciliationSessions(operatingCompanyId: string) {
  return apiRequest<{ open_sessions: ReconciliationSession[]; completed_sessions: ReconciliationSession[] }>(
    `/api/v1/banking/reconciliation/sessions?${q(operatingCompanyId)}`
  );
}

export function getQboSyncQueueStats(operatingCompanyId: string) {
  return apiRequest<QboSyncQueueStats>(`/api/v1/integrations/qbo/sync-queue/stats?${q(operatingCompanyId)}`);
}

export function getQboSyncQueue(
  operatingCompanyId: string,
  options: { status?: "pending" | "in_flight" | "synced" | "failed" | "blocked"; limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (options.status) params.set("status", options.status);
  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));
  return apiRequest<{ items: QboSyncQueueItem[] }>(`/api/v1/integrations/qbo/sync-queue?${params.toString()}`);
}

export function retryQboSyncQueueItem(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true }>(`/api/v1/integrations/qbo/sync-queue/${id}/retry?${q(operatingCompanyId)}`, {
    method: "POST",
  });
}

export function skipQboSyncQueueItem(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ ok: true }>(`/api/v1/integrations/qbo/sync-queue/${id}/skip`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, reason },
  });
}

export function startReconciliationSession(payload: {
  bank_account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_cents: number;
}) {
  return apiRequest<{ session_id: string }>(`/api/v1/banking/reconciliation/start`, {
    method: "POST",
    body: payload,
  });
}

export function getReconciliationWorkspace(sessionId: string, operatingCompanyId: string) {
  return apiRequest<ReconciliationWorkspacePayload>(
    `/api/v1/banking/reconciliation/${sessionId}?${q(operatingCompanyId)}`
  );
}

export function matchReconciliationTransaction(
  sessionId: string,
  operatingCompanyId: string,
  payload: { transaction_id: string; matched_event_type: "load" | "bill" | "settlement"; matched_event_id: string }
) {
  return apiRequest<{ ok: true }>(`/api/v1/banking/reconciliation/${sessionId}/match?${q(operatingCompanyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function unmatchReconciliationTransaction(
  sessionId: string,
  operatingCompanyId: string,
  payload: { transaction_id: string }
) {
  return apiRequest<{ ok: true }>(`/api/v1/banking/reconciliation/${sessionId}/unmatch?${q(operatingCompanyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function completeReconciliationSession(
  sessionId: string,
  operatingCompanyId: string,
  payload: { force_complete?: boolean; reason?: string } = {}
) {
  return apiRequest<{ ok: true; variance_cents: number }>(
    `/api/v1/banking/reconciliation/${sessionId}/complete?${q(operatingCompanyId)}`,
    {
      method: "POST",
      body: payload,
    }
  );
}

export function uploadBankStatementCsv(file: File, bankAccountId: string) {
  const form = new FormData();
  form.append("csv_file", file);
  form.append("bank_account_id", bankAccountId);
  return apiRequestFormData<{ added: number; errors: Array<{ line: number; reason: string }> }>(
    `/api/v1/banking/upload-statement`,
    form
  );
}
