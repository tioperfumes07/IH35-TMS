import { apiRequest } from "./client";

export type IntegrationTxnBankTransaction = {
  txn_date: string | null;
  description: string | null;
  merchant_name: string | null;
  amount_cents: number | null;
  is_credit: boolean | null;
  pending: boolean | null;
  matched_load_id: string | null;
  matched_bill_id: string | null;
  qbo_synced_at: string | null;
};

export type IntegrationTxnItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  sync_status: "pending" | "in_flight" | "synced" | "failed" | "blocked";
  qbo_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  synced_at: string | null;
  error_message: string | null;
  created_at: string;
  bank_transaction: IntegrationTxnBankTransaction | null;
};

export type IntegrationTxnList = {
  total: number;
  limit: number;
  offset: number;
  items: IntegrationTxnItem[];
};

export function getIntegrationTransactions(input: {
  operating_company_id: string;
  sync_status?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.sync_status) q.set("sync_status", input.sync_status);
  if (input.entity_type) q.set("entity_type", input.entity_type);
  if (input.date_from) q.set("date_from", input.date_from);
  if (input.date_to) q.set("date_to", input.date_to);
  if (input.q) q.set("q", input.q);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<IntegrationTxnList>(`/api/v1/accounting/integration-transactions?${q}`);
}
