// A/R invoice-level dispute client (owner ruling 2026-09-12; ROUND 23.3 hub, 2026-09-13).
// Mirrors apps/backend/src/accounting/invoice-disputes.routes.ts one-to-one.
import { apiRequest } from "./client";

export type InvoiceDisputeStatus = "open" | "resolved" | "cancelled";

export type InvoiceDisputeReason =
  | "mis_entry"
  | "customer_discount"
  | "late_fine"
  | "driver_no_answer"
  | "short_pay"
  | "chargeback"
  | "other"
  | "over_payment"
  | "under_billing";

export type InvoiceDisputeResolution =
  | "invoice_corrected"
  | "credit_memo"
  | "collected_in_full"
  | "written_off"
  | "no_change";

export type InvoiceDisputeRow = {
  id: string;
  operating_company_id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  disputed_amount_cents: number;
  invoiced_amount_cents: number;
  expected_amount_cents: number;
  reason_code: InvoiceDisputeReason | string;
  reason_text: string | null;
  status: InvoiceDisputeStatus | string;
  resolution_type: InvoiceDisputeResolution | string | null;
  resolution_text: string | null;
  resolution_amount_cents: number | null;
  resolution_ref_id: string | null;
  opened_at: string;
  opened_by_user_id: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceDisputeQueueResponse = { disputes: InvoiceDisputeRow[] };

export function listInvoiceDisputeQueue(
  operatingCompanyId: string,
  status: InvoiceDisputeStatus | "all" = "open"
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, status });
  return apiRequest<InvoiceDisputeQueueResponse>(`/api/v1/accounting/invoice-disputes?${q.toString()}`);
}

export function listDisputesForInvoice(invoiceId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<InvoiceDisputeQueueResponse>(
    `/api/v1/accounting/invoices/${invoiceId}/disputes?${q.toString()}`
  );
}

export type OpenInvoiceDisputeBody = {
  operating_company_id: string;
  disputed_amount_cents: number;
  expected_amount_cents?: number;
  reason_code: InvoiceDisputeReason;
  reason_text?: string;
};

export function openInvoiceDispute(invoiceId: string, body: OpenInvoiceDisputeBody) {
  return apiRequest<{ dispute: InvoiceDisputeRow }>(`/api/v1/accounting/invoices/${invoiceId}/disputes`, {
    method: "POST",
    body,
  });
}

export type ResolveInvoiceDisputeBody = {
  operating_company_id: string;
  resolution_type: InvoiceDisputeResolution;
  resolution_text?: string;
  resolution_amount_cents?: number;
  resolution_ref_id?: string;
};

export function resolveInvoiceDispute(disputeId: string, body: ResolveInvoiceDisputeBody) {
  return apiRequest<{ dispute: InvoiceDisputeRow }>(
    `/api/v1/accounting/invoice-disputes/${disputeId}/resolve`,
    { method: "POST", body }
  );
}

export function cancelInvoiceDispute(disputeId: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ dispute: InvoiceDisputeRow }>(
    `/api/v1/accounting/invoice-disputes/${disputeId}/cancel`,
    { method: "POST", body: { operating_company_id: operatingCompanyId, reason } }
  );
}
