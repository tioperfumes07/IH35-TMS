import { apiRequest } from "./client";

export type RevenueContractListItem = {
  id: string;
  contract_number: string | null;
  description: string;
  source_type: string;
  customer_uuid: string | null;
  transaction_price_cents: number;
  contract_date: string;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  recognized_to_date_cents: number;
  deferred_balance_cents: number;
  obligation_count: number;
};

export type RecognitionScheduleRow = {
  period_number: number;
  period_date: string;
  recognized_amount_cents: number;
  remaining_deferred_cents: number;
  method_snapshot: string;
};

export type RevenueObligation = {
  id: string;
  obligation_number: number;
  description: string;
  standalone_selling_price_cents: number;
  allocated_price_cents: number;
  recognition_method: string;
  recognition_start_date: string | null;
  recognition_end_date: string | null;
  periods: number | null;
  satisfied_at: string | null;
  satisfied_trigger: string | null;
  status: string;
  recognized_to_date_cents: number;
  remaining_deferred_cents: number;
  schedule: RecognitionScheduleRow[];
  schedule_note: string | null;
};

export type RevenueContractDetail = {
  id: string;
  contract_number: string | null;
  description: string;
  source_type: string;
  source_load_id: string | null;
  source_invoice_id: string | null;
  customer_uuid: string | null;
  transaction_price_cents: number;
  currency_code: string;
  contract_date: string;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  recognized_to_date_cents: number;
  deferred_balance_cents: number;
  je_preview: { posting_enabled: boolean };
  obligations: RevenueObligation[];
};

export type RevenueContractList = { total: number; limit: number; offset: number; items: RevenueContractListItem[] };

export function getRevenueContracts(input: {
  operating_company_id: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.status) q.set("status", input.status);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<RevenueContractList>(`/api/v1/accounting/revenue-contracts?${q}`);
}

export function getRevenueContractDetail(id: string, operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<RevenueContractDetail>(`/api/v1/accounting/revenue-contracts/${id}?${q}`);
}
