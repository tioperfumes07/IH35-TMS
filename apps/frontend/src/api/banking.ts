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
  account_class?: string | null;
  account_mask: string | null;
  plaid_item_id?: string | null;
  current_balance_cents: number;
  available_balance_cents: number;
  currency_code: string;
  sync_status: "pending" | "active" | "disconnected" | "needs_reauth" | "error";
  is_active: boolean;
  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PlaidLinkAccountType = "bank" | "credit_card" | "all";

export type PlaidBankTransaction = {
  id: string;
  bank_account_id?: string;
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
  institution_name?: string | null;
  account_name?: string | null;
  account_mask?: string | null;
  matched_kind?: string | null;
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

export type BankReconWorklistRow = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  is_credit: boolean;
};

export type BankReconWorklistPayload = {
  unmatched_transactions: BankReconWorklistRow[];
  auto_matched_candidates: Array<
    BankReconWorklistRow & {
      ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
      ledger_entry_id: string;
      match_score: number;
      match_state: string;
    }
  >;
  variance_resolved_entries: Array<{
    journal_entry_id: string;
    entry_date: string;
    reference_no: string | null;
    variance_cents: number;
  }>;
  progress: {
    total_transactions: number;
    matched_or_skipped_transactions: number;
    percent: number;
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

export type CategorizationRule = {
  id: string;
  operating_company_id: string;
  plaid_category_pattern: string;
  coa_account_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategorizationRulesStats = {
  active_rules: number;
  matched_7d: number;
  unmatched_7d: number;
};

export type CategorizationPreviewTransaction = {
  id: string;
  transaction_date: string;
  description: string | null;
  plaid_category: string[];
  coa_account_id: string | null;
  account_number: string | null;
  account_name: string | null;
};

export type TransferType = "bank_to_bank" | "cc_payment" | "cash_deposit" | "owner_contribution" | "owner_distribution";
export type TransferAccountKind = "bank" | "cc" | "coa";

export type Transfer = {
  id: string;
  operating_company_id: string;
  transfer_type: TransferType;
  from_account_id: string;
  from_account_kind: TransferAccountKind;
  to_account_id: string;
  to_account_kind: TransferAccountKind;
  amount_cents: number;
  transfer_date: string;
  memo: string | null;
  reference_number: string | null;
  qbo_journal_entry_id: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
  from_bank_name?: string | null;
  to_bank_name?: string | null;
  from_coa_name?: string | null;
  to_coa_name?: string | null;
};

export type EscrowDriverBalance = {
  driver_id: string;
  driver_name: string | null;
  escrow_balance: number;
};

export type EscrowDriverTimelineRow = {
  id: string;
  driver_id: string;
  entry_type: string | null;
  bucket: string | null;
  amount: number;
  memo: string | null;
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

export type UncategorizedBankTransactionsMeta = {
  uncategorized_count?: number;
  total_uncategorized_amount_cents?: number;
  processed_this_week_count?: number;
  auto_categorize_hit_rate_pct?: number | null;
};

export type UncategorizedBankTransactionsResponse = {
  rows?: Array<Record<string, unknown>>;
  /** Legacy client alias; server returns `rows`. */
  transactions?: Array<Record<string, unknown>>;
  total_count?: number;
  total_uncategorized_cents?: number;
  meta?: UncategorizedBankTransactionsMeta;
};

export type UncategorizedBankTransactionsQuery = {
  bank_account_id?: string;
  date_from?: string;
  date_to?: string;
  amount_min_cents?: number;
  amount_max_cents?: number;
  search?: string;
  limit?: number;
  offset?: number;
};

function uncategorizedQs(companyId: string, filters: UncategorizedBankTransactionsQuery = {}) {
  const query = new URLSearchParams();
  query.set("operating_company_id", companyId);
  if (filters.bank_account_id) query.set("bank_account_id", filters.bank_account_id);
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  if (filters.amount_min_cents != null) query.set("amount_min_cents", String(filters.amount_min_cents));
  if (filters.amount_max_cents != null) query.set("amount_max_cents", String(filters.amount_max_cents));
  if (filters.search) query.set("search", filters.search);
  if (filters.limit != null) query.set("limit", String(filters.limit));
  if (filters.offset != null) query.set("offset", String(filters.offset));
  return query.toString();
}

/** Normalized uncategorized / for-review transactions (`GET /banking/transactions/uncategorized`). */
export async function getBankingUncategorized(
  companyId: string,
  filters: UncategorizedBankTransactionsQuery = {}
): Promise<{ transactions: Array<Record<string, unknown>>; meta?: UncategorizedBankTransactionsMeta }> {
  const raw = await apiRequest<UncategorizedBankTransactionsResponse>(
    `/api/v1/banking/transactions/uncategorized?${uncategorizedQs(companyId, filters)}`
  );
  const transactions = raw.rows ?? raw.transactions ?? [];
  return {
    transactions,
    meta: {
      ...raw.meta,
      uncategorized_count: raw.meta?.uncategorized_count ?? raw.total_count,
      total_uncategorized_amount_cents: raw.meta?.total_uncategorized_amount_cents ?? raw.total_uncategorized_cents,
    },
  };
}

export function categorizeBankTransaction(
  transactionId: string,
  companyId: string,
  body: {
    category_kind: string;
    gl_account_id?: string;
    vendor_id?: string;
    customer_id?: string;
    memo?: string;
  }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/categorize?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function categorizeBankTransactionToAccount(
  transactionId: string,
  companyId: string,
  body: { account_id: string; memo?: string }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/categorize?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function bulkCategorizeBankTransactions(
  companyId: string,
  body: { transaction_ids: string[]; account_id: string }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/bulk-categorize?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function markBankTransactionTransfer(
  transactionId: string,
  companyId: string,
  body: { from_account_id: string; to_account_id: string }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/mark-transfer?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

/** Skip / investigate flag + note (P6-T11204). */
export function skipBankTransactionInvestigation(transactionId: string, companyId: string, body: { note: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${transactionId}/skip-investigate?${q(companyId)}`, {
    method: "POST",
    body,
  });
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

export function getAllAccounts(companyId: string, options?: { include_inactive?: boolean }) {
  const params = new URLSearchParams();
  params.set("operating_company_id", companyId);
  if (options?.include_inactive) params.set("include_inactive", "true");
  return apiRequest<{ accounts: Array<Record<string, unknown>> }>(`/api/v1/banking/accounts/all?${params.toString()}`);
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

/**
 * @deprecated ARCHIVED 2026-06-24 (Tier-1 H-1). Zero callers. The `/api/v1/banking/manual-je` endpoint is
 * retired (returns 410 Gone) — it wrote to the forbidden, GL-unread accounting.journal_entry_lines. Post
 * journal entries via the canonical accounting path instead (POST /api/v1/accounting/journal-entries →
 * accounting.journal_entry_postings). Kept (not deleted) per ARCHIVE-never-DELETE; do not wire new callers.
 */
export function createManualJe(
  companyId: string,
  payload: { date: string; memo?: string; lines: Array<{ account_id: string; dr_amount: number; cr_amount: number }> }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/banking/manual-je`, {
    method: "POST",
    body: { operating_company_id: companyId, ...payload },
  });
}

export function createPlaidLinkToken(operatingCompanyId: string, accountType: PlaidLinkAccountType = "bank") {
  return apiRequest<{ link_token: string; expiration: string; accountType?: PlaidLinkAccountType }>(
    `/api/v1/banking/plaid/create-link-token`,
    {
      method: "POST",
      body: { operating_company_id: operatingCompanyId, accountType },
    }
  );
}

export function exchangePlaidPublicToken(publicToken: string, operatingCompanyId: string) {
  return apiRequest<{ accounts: PlaidBankAccount[]; plaid_item_id?: string }>(`/api/v1/banking/plaid/exchange-public-token`, {
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

export function createPlaidUpdateLinkToken(operatingCompanyId: string, plaidItemId: string) {
  return apiRequest<{ link_token: string; expiration: string }>(`/api/v1/banking/plaid/create-update-link-token`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, plaid_item_id: plaidItemId },
  });
}

export function disconnectPlaidItem(operatingCompanyId: string, plaidItemId: string) {
  return apiRequest<{ ok: boolean; deactivated_accounts: number }>(`/api/v1/banking/plaid/items/disconnect`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, plaid_item_id: plaidItemId },
  });
}

export function syncPlaidItem(operatingCompanyId: string, plaidItemId: string) {
  return apiRequest<{
    ok: boolean;
    item_id: string;
    added: number;
    modified: number;
    removed: number;
    has_more: boolean;
  }>(`/api/v1/banking/plaid/items/${encodeURIComponent(plaidItemId)}/sync`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export type CompanyTransactionsSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export function getPlaidCompanyTransactions(
  operatingCompanyId: string,
  options: {
    limit?: number;
    offset?: number;
    q?: string;
    bank_account_id?: string;
    sort?: CompanyTransactionsSort;
  } = {}
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  if (options.q?.trim()) params.set("q", options.q.trim());
  if (options.bank_account_id) params.set("bank_account_id", options.bank_account_id);
  if (options.sort) params.set("sort", options.sort);
  return apiRequest<{ transactions: PlaidBankTransaction[] }>(`/api/v1/banking/plaid/company-transactions?${params.toString()}`);
}

export function getReconciliationSessions(operatingCompanyId: string) {
  return apiRequest<{ open_sessions: ReconciliationSession[]; completed_sessions: ReconciliationSession[] }>(
    `/api/v1/banking/reconciliation/sessions?${q(operatingCompanyId)}`
  );
}

export function getQboSyncQueueStats(operatingCompanyId: string) {
  return apiRequest<QboSyncQueueStats>(`/api/v1/integrations/qbo/sync-queue/stats?${q(operatingCompanyId)}`);
}

export function getCategorizationRules(operatingCompanyId: string) {
  return apiRequest<{ rules: CategorizationRule[] }>(`/api/v1/banking/categorization-rules?${q(operatingCompanyId)}`);
}

export function getCategorizationRulesStats(operatingCompanyId: string) {
  return apiRequest<CategorizationRulesStats>(`/api/v1/banking/categorization-rules/stats?${q(operatingCompanyId)}`);
}

export function getCategorizationPreview(operatingCompanyId: string) {
  return apiRequest<{ transactions: CategorizationPreviewTransaction[] }>(
    `/api/v1/banking/categorization-rules/preview?${q(operatingCompanyId)}`
  );
}

export function createCategorizationRule(
  operatingCompanyId: string,
  payload: { plaid_category_pattern: string; coa_account_id?: string | null; priority: number }
) {
  return apiRequest<{ id: string }>(`/api/v1/banking/categorization-rules?${q(operatingCompanyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function updateCategorizationRule(
  id: string,
  operatingCompanyId: string,
  payload: Partial<{ plaid_category_pattern: string; coa_account_id: string | null; priority: number; is_active: boolean }>
) {
  return apiRequest<{ ok: true; id: string }>(`/api/v1/banking/categorization-rules/${id}?${q(operatingCompanyId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deactivateCategorizationRule(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true; id: string }>(`/api/v1/banking/categorization-rules/${id}?${q(operatingCompanyId)}`, {
    method: "DELETE",
  });
}

export function applyCategorizationRuleHistorical(id: string, operatingCompanyId: string) {
  return apiRequest<{ matched: number }>(`/api/v1/banking/categorization-rules/${id}/apply-historical?${q(operatingCompanyId)}`, {
    method: "POST",
  });
}

export function getCoaAccounts() {
  return apiRequest<{ accounts: Array<{ id: string; account_number: string; account_name: string; deactivated_at?: string | null }> }>(
    `/api/v1/catalogs/accounts?status=active&limit=200`
  );
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

export function createTransfer(
  operatingCompanyId: string,
  payload: {
    transfer_type: TransferType;
    from_account_id: string;
    from_account_kind: TransferAccountKind;
    to_account_id: string;
    to_account_kind: TransferAccountKind;
    amount_cents: number;
    transfer_date: string;
    memo?: string;
    reference_number?: string;
  }
) {
  return apiRequest<{ transfer: Transfer }>(`/api/v1/banking/transfers`, {
    method: "POST",
    body: {
      operating_company_id: operatingCompanyId,
      ...payload,
    },
  });
}

export function recordCcPayment(
  operatingCompanyId: string,
  payload: {
    cc_vendor_id: string;
    cc_liability_coa_account_id: string;
    from_bank_account_id: string;
    payment_date: string;
    amount_cents: number;
    memo?: string;
    statement_period?: string;
  }
) {
  return apiRequest<{ transfer: Transfer }>(`/api/v1/banking/cc-payments`, {
    method: "POST",
    body: {
      operating_company_id: operatingCompanyId,
      ...payload,
    },
  });
}

export function listTransfers(
  operatingCompanyId: string,
  options: {
    from?: string;
    to?: string;
    type?: TransferType;
    accountId?: string;
    status?: "active" | "revoked";
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.type) params.set("type", options.type);
  if (options.accountId) params.set("account_id", options.accountId);
  if (options.status) params.set("status", options.status);
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  return apiRequest<{ transfers: Transfer[] }>(`/api/v1/banking/transfers?${params.toString()}`);
}

export function getTransfer(id: string, operatingCompanyId: string) {
  return apiRequest<{ transfer: Transfer; audit_events: Array<Record<string, unknown>> }>(
    `/api/v1/banking/transfers/${id}?${q(operatingCompanyId)}`
  );
}

export function revokeTransfer(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ transfer: Transfer }>(`/api/v1/banking/transfers/${id}/revoke?${q(operatingCompanyId)}`, {
    method: "POST",
    body: { reason },
  });
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

export function getBankReconWorklist(
  operatingCompanyId: string,
  input: {
    account_id: string;
    period_start: string;
    period_end: string;
  }
) {
  const query = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    account_id: input.account_id,
    period_start: input.period_start,
    period_end: input.period_end,
  });
  return apiRequest<BankReconWorklistPayload>(`/api/v1/bank-recon/worklist?${query.toString()}`);
}

export function acceptBankReconMatch(
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
    ledger_entry_id: string;
    variance_account_id?: string;
  }
) {
  return apiRequest<{ ok: boolean; result: Record<string, unknown> }>(`/api/v1/bank-recon/accept-match`, {
    method: "POST",
    body: input,
  });
}

export function rejectBankReconMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
  ledger_entry_id: string;
}) {
  return apiRequest<{ ok: boolean }>(`/api/v1/bank-recon/reject-match`, {
    method: "POST",
    body: input,
  });
}

export function manualBankReconMatch(
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
    ledger_entry_id: string;
    variance_account_id?: string;
  }
) {
  return apiRequest<{ ok: boolean; result: Record<string, unknown> }>(`/api/v1/bank-recon/manual-match`, {
    method: "POST",
    body: input,
  });
}

export function closeBankReconPeriod(input: {
  operating_company_id: string;
  account_id: string;
  period_end: string;
}) {
  return apiRequest<{
    ok: boolean;
    covered_transactions: number;
    total_transactions: number;
    closed_period_cutoff: string | null;
  }>(`/api/v1/bank-recon/close-period`, {
    method: "POST",
    body: input,
  });
}

export function getEscrowDriverBalances(operatingCompanyId: string) {
  return apiRequest<{ drivers: EscrowDriverBalance[] }>(`/api/v1/banking/escrow-visualizer?${q(operatingCompanyId)}`);
}

export function getEscrowDriverTimeline(operatingCompanyId: string, driverId: string) {
  return apiRequest<{ timeline: EscrowDriverTimelineRow[] }>(
    `/api/v1/banking/escrow-visualizer/${encodeURIComponent(driverId)}?${q(operatingCompanyId)}`
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

export type ObligationType = "load" | "settlement" | "fuel" | "work_order" | "ar_invoice" | "bill";
export type ReconcileSuggestionType = ObligationType | "factoring_batch";

export type ReconcileSuggestion = {
  obligation_type: ReconcileSuggestionType;
  obligation_id: string;
  label: string;
  amount_cents: number;
  event_date: string;
  confidence: number;
  lev: number;
  suggestion_source?: "obligation" | "factoring";
  bank_match_suggestion_id?: string;
  batch_number?: string;
};

export type UnmatchedBankTxnRow = {
  id: string;
  bank_account_id: string;
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
  reconciled_obligation_type: string | null;
  reconciled_obligation_id: string | null;
  reviewed_at: string | null;
  status: string | null;
  category: string | null;
  notes?: string | null;
  created_at?: string;
};

export function listUnmatchedReconcileTransactions(
  operatingCompanyId: string,
  filters: { bank_account_id?: string; date_from?: string; date_to?: string; amount_min_cents?: number; amount_max_cents?: number } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters.bank_account_id) q.set("bank_account_id", filters.bank_account_id);
  if (filters.date_from) q.set("date_from", filters.date_from);
  if (filters.date_to) q.set("date_to", filters.date_to);
  if (filters.amount_min_cents != null) q.set("amount_min_cents", String(filters.amount_min_cents));
  if (filters.amount_max_cents != null) q.set("amount_max_cents", String(filters.amount_max_cents));
  return apiRequest<{ transactions: UnmatchedBankTxnRow[] }>(`/api/v1/banking/reconcile/unmatched-transactions?${q}`);
}

export function listReconcileObligations(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{
    obligations: Array<{
      obligation_type: ObligationType;
      obligation_id: string;
      label: string;
      amount_cents: number;
      event_date: string;
    }>;
  }>(`/api/v1/banking/reconcile/obligations?${q}`);
}

export function getReconcileSuggestions(operatingCompanyId: string, bankTransactionId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, bank_transaction_id: bankTransactionId });
  return apiRequest<{
    suggestions: ReconcileSuggestion[];
  }>(`/api/v1/banking/reconcile/suggestions?${q}`);
}

export function reconcileBankTransaction(
  operatingCompanyId: string,
  body: { bank_transaction_id: string; obligation_type: ObligationType; obligation_id: string }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ok: true }>(`/api/v1/banking/reconcile?${q}`, { method: "POST", body });
}

export function applyFactoringBankMatch(operatingCompanyId: string, suggestionId: string) {
  return apiRequest<{ ok: true; applied: { id: string; bank_txn_id: string; batch_id: string; applied_at: string } }>(
    `/api/v1/banking/reconcile/factoring/apply`,
    {
      method: "POST",
      body: {
        operating_company_id: operatingCompanyId,
        suggestion_id: suggestionId,
      },
    }
  );
}

export const bankMatch = {
  applyMatch: applyFactoringBankMatch,
};

export function bulkReconcileAction(
  operatingCompanyId: string,
  body: {
    bank_transaction_ids: string[];
    action: "mark_reviewed" | "categorize_fuel" | "categorize_insurance" | "categorize_transfer";
  }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ok: true; updated_count: number }>(`/api/v1/banking/reconcile/bulk?${q}`, { method: "POST", body });
}
