/**
 * CUSTOMER REFUNDS (owner 2026-11-27 22:40 CT "Build refund engine") — pay a customer's credit-memo credit back by check / ACH /
 * wire / card / cash. The backend posts Dr A/R / Cr the bank (accounting/customer-refunds.service.ts); void reverses it.
 */
import { apiRequest } from "./client";

export type RefundMethod = "check" | "ach" | "wire" | "card" | "cash";
export type CustomerRefund = {
  id: string; display_id: string; customer_id: string; credit_memo_id: string; credit_memo_display_id: string | null;
  refund_date: string; amount_cents: number; method: RefundMethod; reference: string | null; bank_account_id: string;
  bank_account_name: string | null; memo: string | null; journal_entry_id: string | null; created_at: string;
  voided_at: string | null; void_reason: string | null;
};

const q = (companyId: string) => `operating_company_id=${encodeURIComponent(companyId)}`;

export function listCustomerRefunds(companyId: string, params: { customer_id?: string; credit_memo_id?: string }) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.customer_id) qs.set("customer_id", params.customer_id);
  if (params.credit_memo_id) qs.set("credit_memo_id", params.credit_memo_id);
  return apiRequest<{ refunds: CustomerRefund[] }>(`/api/v1/accounting/customer-refunds?${qs.toString()}`);
}

export function createCustomerRefund(companyId: string, body: {
  credit_memo_id: string; bank_account_id: string; amount_cents: number; refund_date?: string; method: RefundMethod;
  reference?: string; memo?: string; idempotency_key?: string;
}) {
  return apiRequest<{ refund: CustomerRefund; replayed?: boolean }>(`/api/v1/accounting/customer-refunds?${q(companyId)}`, { method: "POST", body });
}

export function voidCustomerRefund(companyId: string, refundId: string, reason: string) {
  return apiRequest<{ refund: CustomerRefund; reversal_journal_entry_id: string | null }>(
    `/api/v1/accounting/customer-refunds/${encodeURIComponent(refundId)}/void?${q(companyId)}`, { method: "POST", body: { reason } });
}
