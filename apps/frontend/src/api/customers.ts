import { apiRequest } from "./client";
import { createCoiRequest as createInsuranceCoiRequest, listCoiRequests as listInsuranceCoiRequests, type CoiRequestStatus } from "./insurance";

export type RecordCustomerPaymentPayload = {
  date: string;
  amount_cents: number;
  method: string;
  reference?: string;
  memo?: string;
  applications: Array<{ invoice_id: string; amount_cents: number }>;
  remaining_to_credit_balance_cents: number;
};

export type CustomerPaymentListRow = {
  id: string;
  payment_date: string;
  amount_cents: number;
  payment_method?: string;
  method?: string;
  amount_applied_cents?: number;
  applied_total_cents?: number;
  reference?: string | null;
  journal_entry_id?: string | null;
  qbo_journal_entry_id?: string | null;
};

export function recordCustomerPayment(customerId: string, payload: RecordCustomerPaymentPayload) {
  return apiRequest<{ ok?: boolean; id?: string }>(`/api/v1/customers/${customerId}/payments`, {
    method: "POST",
    body: payload,
  });
}

export function listCustomerPayments(customerId: string, params: { limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<{ payments: CustomerPaymentListRow[] }>(`/api/v1/customers/${customerId}/payments${suffix}`);
}

export function unapplyCustomerPayment(customerId: string, paymentId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/customers/${customerId}/payments/${paymentId}/unapply`, {
    method: "POST",
  });
}


export function listCoiRequests(customerId: string, params: { operating_company_id: string; status?: CoiRequestStatus }) {
  return listInsuranceCoiRequests(customerId, params);
}

export function createCoiRequest(customerId: string, payload: {
  operating_company_id: string;
  policy_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
}) {
  return createInsuranceCoiRequest(customerId, payload);
}
