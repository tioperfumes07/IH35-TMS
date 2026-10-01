import { apiRequest } from "./client";

export type Set01EligibleLoad = {
  load_id: string;
  load_number: string;
  customer_id: string | null;
  customer_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  trailer_id: string | null;
  trip_type: string | null;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  pickup_city: string | null;
  delivery_city: string | null;
  miles_practical: number | null;
  loaded_miles: number | null;
  empty_miles: number | null;
  rate_total_cents: number | null;
  driver_pay_rate_per_mile: number | null;
  presettlement_link_id: string | null;
  already_on_closed_settlement: boolean;
};

export type BatchSettlementMoneyLine = {
  description: string;
  amount_cents: number;
  load_number?: string | null;
};

export type BatchSettlementAdvanceLine = {
  description?: string | null;
  amount_cents: number;
  load_number?: string | null;
  linked_driver_bill_id?: string | null;
};

export type BatchSettlementRowInput = {
  driver_id: string;
  period_start: string;
  period_end: string;
  settlement_no?: string | null;
  unit_id?: string | null;
  load_ids?: string[] | null;
  deductions?: BatchSettlementMoneyLine[];
  advances?: BatchSettlementAdvanceLine[];
  admin_fee_cents?: number | null;
  confirmed_zero_fuel_purchases?: boolean;
};

export type BatchSettlementRowResult =
  | {
      ok: true;
      index: number;
      settlement: {
        settlement_id: string;
        source_document_ref: string;
        display_id: string;
        load_ids: string[];
        journal_entry_ids: string[];
      };
      load_numbers: string[];
    }
  | { ok: false; index: number; error: string; message: string };

export function listBatchSettlementEligibleLoads(params: {
  operating_company_id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
}) {
  const q = new URLSearchParams({
    operating_company_id: params.operating_company_id,
    driver_id: params.driver_id,
    period_start: params.period_start,
    period_end: params.period_end,
  });
  return apiRequest<{ rows: Set01EligibleLoad[]; count: number }>(
    `/api/v1/driver-finance/batch-settlements/eligible-loads?${q.toString()}`,
  );
}

export function postBatchSettlements(body: {
  operating_company_id: string;
  rows: BatchSettlementRowInput[];
}) {
  return apiRequest<{ results: BatchSettlementRowResult[]; saved: number; failed: number }>(
    `/api/v1/driver-finance/batch-settlements`,
    { method: "POST", body: body },
  );
}
