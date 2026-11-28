/**
 * VENDOR REFUNDS (mirror of customer refunds) — a vendor pays back a vendor credit by check / ACH / wire / card / cash into a bank or
 * cash account. The backend posts Dr bank / Cr A/P (accounting/vendor-refunds.service.ts); void reverses it.
 */
import { apiRequest } from "./client";
import type { RefundMethod } from "./customer-refunds";

export type VendorRefund = {
  id: string; display_id: string; vendor_id: string | null; vendor_credit_id: string; vendor_credit_display_id: string | null;
  refund_date: string; amount_cents: number; method: RefundMethod; reference: string | null; bank_account_id: string;
  bank_account_name: string | null; memo: string | null; journal_entry_id: string | null; created_at: string;
  voided_at: string | null; void_reason: string | null;
};
const q = (companyId: string) => `operating_company_id=${encodeURIComponent(companyId)}`;

export function listVendorRefunds(companyId: string, params: { vendor_id?: string; vendor_credit_id?: string }) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.vendor_id) qs.set("vendor_id", params.vendor_id);
  if (params.vendor_credit_id) qs.set("vendor_credit_id", params.vendor_credit_id);
  return apiRequest<{ refunds: VendorRefund[] }>(`/api/v1/accounting/vendor-refunds?${qs.toString()}`);
}
export function createVendorRefund(companyId: string, body: {
  vendor_credit_id: string; bank_account_id: string; amount_cents: number; refund_date?: string; method: RefundMethod;
  reference?: string; memo?: string; idempotency_key?: string;
}) {
  return apiRequest<{ refund: VendorRefund; replayed?: boolean }>(`/api/v1/accounting/vendor-refunds?${q(companyId)}`, { method: "POST", body });
}
export function voidVendorRefund(companyId: string, refundId: string, reason: string) {
  return apiRequest<{ refund: VendorRefund; reversal_journal_entry_id: string | null }>(
    `/api/v1/accounting/vendor-refunds/${encodeURIComponent(refundId)}/void?${q(companyId)}`, { method: "POST", body: { reason } });
}
