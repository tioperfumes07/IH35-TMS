import { apiRequest } from "./client";

export type RecordVendorBillPaymentPayload = {
  operating_company_id: string;
  date: string;
  amount_cents: number;
  method: string;
  reference?: string;
  memo?: string;
  applications: Array<{ bill_id: string; amount_cents: number }>;
  remaining_to_credit_balance_cents?: number;
};

export type VendorBillPaymentListRow = {
  id: string;
  payment_date: string;
  amount_cents: number;
  payment_method?: string;
  method?: string;
  amount_applied_cents?: number;
  reference?: string | null;
  journal_entry_id?: string | null;
};

export function recordVendorBillPayment(vendorId: string, payload: RecordVendorBillPaymentPayload) {
  return apiRequest<{ ok?: boolean; id?: string }>(`/api/v1/vendors/${vendorId}/bill-payments`, {
    method: "POST",
    body: payload,
  });
}

export function listVendorBillPayments(
  vendorId: string,
  params: { operating_company_id: string; limit?: number }
) {
  const qs = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.limit != null) qs.set("limit", String(params.limit));
  return apiRequest<{ payments: VendorBillPaymentListRow[] }>(`/api/v1/vendors/${vendorId}/bill-payments?${qs.toString()}`);
}
