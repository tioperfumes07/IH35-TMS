/** Reclassify Transactions (QBO Tools → Reclassify clone) — Lead 2026-10-01, spec §24. */
import { apiRequest } from "./client";

export type ReclassifyAccount = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: "debit" | "credit";
  period_debits_cents: number;
  period_credits_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
};

export type ReclassifyLine = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  source_transaction_line_id: string | null;
  document_number: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  class_id: string | null;
  class_name: string | null;
  location_id: string | null;
  location_name: string | null;
  entity_uuid: string | null;
  entity_type: string | null;
  entity_name: string | null;
  description: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  net_amount_cents: number;
  already_reclassified_batch_id: string | null;
};

export type ReclassifyLinesResponse = { lines: ReclassifyLine[]; total_lines: number; total_net_amount_cents: number; limit: number; offset: number };

export type ReclassifyDocumentResult = {
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  document_number: string | null;
  reclass_journal_entry_id: string | null;
  lines_applied: number;
  lines_refused: number;
  document_updated: boolean;
  document_update_note: string | null;
  refusal_reason: string | null;
};

export type ReclassifyBatchResult = { batch_id: string; lines_requested: number; lines_applied: number; lines_refused: number; amount_cents_moved: number; documents: ReclassifyDocumentResult[] };

export type ReclassifyBatch = {
  id: string; created_at: string; reason: string; status: "applied" | "undone"; lines_requested: number; lines_applied: number; lines_refused: number; amount_cents_moved: number;
  to_account_id: string | null; to_account_number: string | null; to_account_name: string | null; to_class_id: string | null; to_class_name: string | null;
  to_location_id: string | null; to_location_name: string | null;
  to_entity_uuid: string | null; to_entity_type: string | null; undone_at: string | null; undo_reason: string | null; created_by_email: string | null;
};

export function getReclassifyAccounts(operatingCompanyId: string, fromDate: string, toDate: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate });
  return apiRequest<{ from_date: string; to_date: string; accounts: ReclassifyAccount[] }>(`/api/v1/accounting/reclassify/accounts?${q}`);
}

export function findReclassifyLines(
  operatingCompanyId: string,
  params: { from_date: string; to_date: string; account_ids?: string[]; source_types?: string[]; class_id?: string; entity_uuid?: string; search?: string; limit?: number; offset?: number },
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: params.from_date, to_date: params.to_date });
  if (params.account_ids?.length) q.set("account_ids", params.account_ids.join(","));
  if (params.source_types?.length) q.set("source_types", params.source_types.join(","));
  if (params.class_id) q.set("class_id", params.class_id);
  if (params.entity_uuid) q.set("entity_uuid", params.entity_uuid);
  if (params.search) q.set("search", params.search);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  return apiRequest<ReclassifyLinesResponse>(`/api/v1/accounting/reclassify/lines?${q}`);
}

export function applyReclassify(body: {
  operating_company_id: string; posting_ids: string[]; reason: string;
  to_account_id?: string | null; to_class_id?: string | null; to_location_id?: string | null; to_entity_uuid?: string | null; to_entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  filter_snapshot?: Record<string, unknown>;
}) {
  return apiRequest<ReclassifyBatchResult>("/api/v1/accounting/reclassify/apply", { method: "POST", body });
}

export function listReclassifyBatches(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ batches: ReclassifyBatch[] }>(`/api/v1/accounting/reclassify/batches?${q}`);
}

export function undoReclassifyBatch(operatingCompanyId: string, batchId: string, reason: string) {
  return apiRequest<{ batch_id: string; journal_entries_reversed: number }>(`/api/v1/accounting/reclassify/batches/${batchId}/undo`, { method: "POST", body: { operating_company_id: operatingCompanyId, reason } });
}
