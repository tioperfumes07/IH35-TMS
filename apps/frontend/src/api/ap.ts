import { apiRequest } from "./client";

export type ApBillPaymentPayload = {
  vendor_id: string;
  paid_at: string;
  amount_cents: number;
  payment_method: "check" | "ach" | "wire" | "cash" | "credit_card";
  bank_account_id?: string;
  reference_number?: string;
  check_number?: string;
  memo?: string;
  applications: Array<{ bill_id: string; amount_cents: number }>;
};

export function recordApBillPayment(operatingCompanyId: string, payload: ApBillPaymentPayload) {
  return apiRequest<{ payment_batch_id: string; bill_payment_ids: string[]; applications: ApBillPaymentPayload["applications"] }>(
    `/api/v1/ap/bill-payments?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: payload }
  );
}
