import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type CashAdvancePurpose = "fuel_deposit" | "border_fee" | "family_emergency" | "vendor_payment" | "other";
export type CashAdvanceMethod = "direct_bank_transfer" | "wire" | "comdata" | "in_person_check";

export type CashAdvanceCreatePayload = {
  driver_id: string;
  amount: number;
  purpose: CashAdvancePurpose;
  disbursement_method: CashAdvanceMethod;
  recipient_info: {
    recipient_type: "driver" | "vendor" | "third_party";
    recipient_name?: string;
    notes?: string;
  };
  linked_bill_id?: string;
  repayment_schedule: {
    weekly_installment_amount: number;
    total_periods: number;
    cadence: "weekly" | "biweekly";
  };
};

export function getCashAdvancesKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/cash-advances/dashboard/kpis?${q(companyId)}`);
}

export function listCashAdvances(
  companyId: string,
  filters: { view?: "all" | "pending_approval" | "outstanding" | "paid_off"; search?: string } = {}
) {
  const query = new URLSearchParams({ operating_company_id: companyId });
  if (filters.view) query.set("view", filters.view);
  if (filters.search) query.set("search", filters.search);
  return apiRequest<{ advances: Array<Record<string, unknown>> }>(`/api/v1/cash-advances?${query.toString()}`);
}

export function getCashAdvanceDetail(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/cash-advances/${id}?${q(companyId)}`);
}

export function createCashAdvance(companyId: string, payload: CashAdvanceCreatePayload) {
  return apiRequest<Record<string, unknown>>(`/api/v1/cash-advances?${q(companyId)}`, { method: "POST", body: payload });
}

export function listUnpaidBills(companyId: string) {
  return apiRequest<{ bills: Array<Record<string, unknown>> }>(`/api/v1/cash-advances/unpaid-bills?${q(companyId)}`);
}

export function markCashAdvanceDisbursed(
  id: string,
  companyId: string,
  payload: { disbursement_method?: CashAdvanceMethod; bank_txn_id?: string; comdata_txn_id?: string; check_number?: string; wire_confirmation_ref?: string }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/cash-advances/${id}/mark-disbursed?${q(companyId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function reverseCashAdvance(id: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/cash-advances/${id}/reverse?${q(companyId)}`, {
    method: "PATCH",
  });
}
