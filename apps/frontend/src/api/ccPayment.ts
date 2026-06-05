import { apiRequest } from "./client";
export function submitCcBillPayment(operatingCompanyId: string, body: {
  bill_id: string; cc_account_id: string; payment_amount_cents: number; payment_date: string; memo?: string;
}) {
  return apiRequest(`/api/v1/bill-payments/cc?operating_company_id=${operatingCompanyId}`, { method: "POST", body });
}
