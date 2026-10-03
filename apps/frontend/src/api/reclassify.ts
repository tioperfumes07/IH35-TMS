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
  /** U27 — the account's type, so the screen can present the line in the account's natural sign. */
  account_type?: string | null;
  /** U22 — the source document was purged (REVERSE -> VOID -> PURGE); its number comes from the audit trail. */
  document_purged?: boolean;
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
  /** ROUND 370 — every posting behind the balance is listed; reversed / reversal rows are shown but not reclassifiable. */
  is_reversed: boolean;
  is_reversal: boolean;
  item_id: string | null;
  item_name: string | null;
  load_id: string | null;
  load_number: string | null;
  unit_id?: string | null;
  unit_number?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  trailer_id?: string | null;
  trailer_number?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number;
};

export type ReclassifyLinesResponse = {
  lines: ReclassifyLine[];
  total_lines: number;
  total_net_amount_cents: number;
  total_debit_cents: number;
  total_credit_cents: number;
  reclassifiable_lines: number;
  opening_cents: number;
  closing_balance_cents: number;
  sort_key: string;
  sort_dir: "asc" | "desc";
  limit: number;
  offset: number;
};

/** ROUND 368.1 — the whole chart of accounts, balances derived from the GL postings (0.00 included, inactive flagged). */
export type ReclassifyTreeAccount = {
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  account_subtype: string | null;
  detail_type_name: string | null;
  parent_account_id: string | null;
  side: "balance_sheet" | "profit_and_loss" | "statistical";
  is_active: boolean;
  is_postable: boolean;
  opening_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
  period_line_count: number;
};

/** ROUND 370 (owner) — the values each register column holds in the window: the multi-select filter options. */
export type ReclassifyFacet = { id: string; label: string; n: number };
export type ReclassifyFacets = Record<"types" | "classes" | "items" | "loads" | "trucks" | "drivers" | "trailers" | "vendors", ReclassifyFacet[]>;
export function getReclassifyFacets(operatingCompanyId: string, fromDate: string, toDate: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate });
  return apiRequest<ReclassifyFacets>(`/api/v1/accounting/reclassify/facets?${q}`);
}

export function getReclassifyAccountTree(operatingCompanyId: string, fromDate: string, toDate: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate });
  return apiRequest<{ from_date: string; to_date: string; accounts: ReclassifyTreeAccount[]; longest_account_name_chars: number }>(
    `/api/v1/accounting/reclassify/account-tree?${q}`,
  );
}

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
  override_refusals?: boolean;
};

export function getReclassifyAccounts(operatingCompanyId: string, fromDate: string, toDate: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate });
  return apiRequest<{ from_date: string; to_date: string; accounts: ReclassifyAccount[] }>(`/api/v1/accounting/reclassify/accounts?${q}`);
}

export function findReclassifyLines(
  operatingCompanyId: string,
  params: {
    from_date: string; to_date: string; account_ids?: string[]; source_types?: string[]; class_id?: string; entity_uuid?: string; search?: string;
    item_ids?: string[]; load_ids?: string[]; source_transaction_ids?: string[];
    class_ids?: string[]; unit_ids?: string[]; driver_ids?: string[]; trailer_ids?: string[]; vendor_ids?: string[]; sort_key?: string; sort_dir?: "asc" | "desc"; limit?: number; offset?: number;
  },
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, from_date: params.from_date, to_date: params.to_date });
  if (params.account_ids?.length) q.set("account_ids", params.account_ids.join(","));
  if (params.source_types?.length) q.set("source_types", params.source_types.join(","));
  if (params.class_id) q.set("class_id", params.class_id);
  if (params.entity_uuid) q.set("entity_uuid", params.entity_uuid);
  if (params.search) q.set("search", params.search);
  if (params.item_ids?.length) q.set("item_ids", params.item_ids.join(","));
  if (params.load_ids?.length) q.set("load_ids", params.load_ids.join(","));
  if (params.source_transaction_ids?.length) q.set("source_transaction_ids", params.source_transaction_ids.join(","));
  for (const k of ["class_ids", "unit_ids", "driver_ids", "trailer_ids", "vendor_ids"] as const) {
    const v = params[k];
    if (v?.length) q.set(k, v.join(","));
  }
  if (params.sort_key) q.set("sort_key", params.sort_key);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  return apiRequest<ReclassifyLinesResponse>(`/api/v1/accounting/reclassify/lines?${q}`);
}

export function applyReclassify(body: {
  operating_company_id: string; posting_ids: string[]; reason: string;
  to_account_id?: string | null; to_class_id?: string | null; to_location_id?: string | null; to_entity_uuid?: string | null; to_entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  filter_snapshot?: Record<string, unknown>;
  /** LAW 363.5 — owner only: apply over the refused classes (A/R, A/P, inventory, payroll); never a bank line; audited per line. */
  override_refusals?: boolean;
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
