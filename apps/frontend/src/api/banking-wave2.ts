import { apiRequest } from "./client";

export type BankingReviewState = "for_review" | "categorized" | "excluded" | "matched" | "transfer";

export type BankingReviewSuggestion = {
  vendor_id: string | null;
  account_id: string | null;
  class_id: string | null;
  confidence: string | null;
  source: string | null;
} | null;

export function getBankingTransactionsReview(
  companyId: string,
  params: {
    state?: BankingReviewState;
    account_id?: string;
    search?: string;
    cursor?: number;
    limit?: number;
    date_start?: string;
    date_end?: string;
  } = {}
) {
  const q = new URLSearchParams();
  q.set("operating_company_id", companyId);
  if (params.state) q.set("state", params.state);
  if (params.account_id) q.set("account_id", params.account_id);
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.cursor != null) q.set("cursor", String(params.cursor));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.date_start) q.set("date_start", params.date_start);
  if (params.date_end) q.set("date_end", params.date_end);
  return apiRequest<{ items: Array<Record<string, unknown>>; next_cursor: number }>(`/api/v1/banking/transactions/review?${q}`);
}

export function getBankingRules(companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/v1/banking/rules?${q}`);
}

export function createBankingRule(
  companyId: string,
  body: {
    priority?: number;
    description_contains?: string;
    description_regex?: string;
    amount_min_cents?: number;
    amount_max_cents?: number;
    bank_account_filter_id?: string;
    then_vendor_id?: string;
    then_account_id: string;
    then_class_id?: string;
    then_memo_template?: string;
  }
) {
  return apiRequest<{ id: string }>(`/api/v1/banking/rules`, {
    method: "POST",
    body: { operating_company_id: companyId, ...body },
  });
}

export function patchBankingRule(
  ruleId: string,
  companyId: string,
  body: { priority?: number; is_active?: boolean }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/rules/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: { operating_company_id: companyId, ...body },
  });
}

export function deleteBankingRule(ruleId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/rules/${encodeURIComponent(ruleId)}?${q}`, { method: "DELETE" });
}

export function refreshBankTransactionSuggestion(transactionId: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${encodeURIComponent(transactionId)}/refresh-suggestion`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function createReconciliationSession(body: {
  operating_company_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_cents: number;
}) {
  return apiRequest<{ id: string }>(`/api/v1/banking/reconciliation-sessions`, { method: "POST", body });
}

export function listReconciliationSessions(companyId: string, accountId?: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (accountId) q.set("account_id", accountId);
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/v1/banking/reconciliation-sessions?${q}`);
}

export function getReconciliationSessionDetail(sessionId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{
    session: Record<string, unknown>;
    matched_transactions: Array<Record<string, unknown>>;
  }>(`/api/v1/banking/reconciliation-sessions/${encodeURIComponent(sessionId)}?${q}`);
}

export function finalizeReconciliationSession(sessionId: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/reconciliation-sessions/${encodeURIComponent(sessionId)}/finalize`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

/** Wave 2 contract (ships with backend). Falls back is handled in UI when 404. */
export async function postBankTransactionAccept(
  transactionId: string,
  companyId: string,
  body: { vendor_id: string | null; account_id: string | null; class_id?: string | null; memo?: string | null }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${encodeURIComponent(transactionId)}/accept`, {
    method: "POST",
    body: {
      operating_company_id: companyId,
      vendor_id: body.vendor_id,
      account_id: body.account_id,
      class_id: body.class_id ?? null,
      memo: body.memo ?? null,
    },
  });
}

export async function getBankTransactionMatchCandidates(transactionId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{ candidates: Array<Record<string, unknown>> }>(
    `/api/v1/banking/transactions/${encodeURIComponent(transactionId)}/match-candidates?${q}`
  );
}

export async function postBankTransactionMatch(transactionId: string, companyId: string, body: { kind: string; target_id: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/${encodeURIComponent(transactionId)}/match`, {
    method: "POST",
    body: { operating_company_id: companyId, ...body },
  });
}

export async function postBankTransactionsBatchAccept(companyId: string, body: { transaction_ids: string[]; defaults?: Record<string, unknown> }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/banking/transactions/batch-accept`, {
    method: "POST",
    body: { operating_company_id: companyId, ...body },
  });
}

export async function postBankingRulesFromTransaction(transactionId: string, companyId: string, generalization: string) {
  return apiRequest<{ id: string; priority?: number }>(`/api/v1/banking/rules/from-transaction/${encodeURIComponent(transactionId)}`, {
    method: "POST",
    body: { operating_company_id: companyId, generalization },
  });
}
