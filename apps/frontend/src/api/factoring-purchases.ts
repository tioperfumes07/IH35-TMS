// ROUND 315 step 3 — Submit to Factor tab client for apps/backend/src/factoring/purchase.routes.ts.
import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type PurchaseCandidate = {
  invoice_id: string;
  invoice_display_id: string | null;
  invoice_status: string;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  open_cents: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_po_number: string | null;
  customer_wo_number: string | null;
  load_id: string | null;
  load_number: string | null;
  settlement_id: string | null;
  settlement_display_id: string | null;
  settlement_is_presettlement: boolean;
  settlement_status: string | null;
  pickup_at: string | null;
  delivery_at: string | null;
  factor_id: string | null;
  factor_name: string | null;
  reserve_rate: number;
  fee_rate: number;
  cash_reserve_rate: number;
  expected_escrow_reserve_cents: number;
  expected_cash_reserve_cents: number;
  expected_fee_cents: number;
  has_bol: boolean;
  has_pod: boolean;
  has_rate_confirmation: boolean;
  docs_complete: boolean;
  missing_docs: string[];
};

export type FactoringVendorOption = { id: string; vendor_name: string; email: string | null; is_default: boolean };

export type PurchaseCandidatesResponse = {
  candidates: PurchaseCandidate[];
  capped: boolean;
  limit: number;
  factoring_vendors: FactoringVendorOption[];
  as_of: string;
};

export type CandidateFilters = { from?: string; to?: string; customer_id?: string; search?: string };

export function listPurchaseCandidates(companyId: string, filters: CandidateFilters = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  return apiRequest<PurchaseCandidatesResponse>(`/api/v1/factoring/purchases/candidates?${qs.toString()}`);
}

export type DirectPayInvoice = {
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_cents: number;
  direct_pay_at: string | null;
  reason: string | null;
};

export function listDirectPayInvoices(companyId: string) {
  return apiRequest<{ invoices: DirectPayInvoice[] }>(`/api/v1/factoring/purchases/candidates/direct-pay?${q(companyId)}`);
}

export function markInvoiceDirectPay(companyId: string, invoiceId: string, reason: string) {
  return apiRequest<{ invoice_id: string; factoring_direct_pay: boolean }>(
    `/api/v1/factoring/purchases/candidates/${encodeURIComponent(invoiceId)}/direct-pay?${q(companyId)}`,
    { method: "POST", body: { reason } }
  );
}

export function undoInvoiceDirectPay(companyId: string, invoiceId: string, reason: string) {
  return apiRequest<{ invoice_id: string; factoring_direct_pay: boolean }>(
    `/api/v1/factoring/purchases/candidates/${encodeURIComponent(invoiceId)}/undo-direct-pay?${q(companyId)}`,
    { method: "POST", body: { reason } }
  );
}

export type CreateFactoringPurchaseBody = {
  factoring_company_vendor_id: string;
  purchase_date: string;
  wire_date?: string | null;
  faro_report_ref?: string | null;
  wire_fee_cents?: number;
  notes?: string | null;
  lines: Array<{ invoice_id: string; gross_cents?: number; escrow_reserve_cents?: number; cash_reserve_cents?: number; fee_cents?: number }>;
  /** ROUND 321: Owner override reason for missing BOL / POD / rate confirmation (documents only, >= 10 chars). */
  docs_override_reason?: string;
};

export type FactoringPurchaseDetail = {
  id: string;
  display_id: string;
  status: "draft" | "posted" | "voided";
  purchase_date: string;
  wire_date: string | null;
  invoice_count: number;
  gross_cents: number | string;
  escrow_reserve_cents: number | string;
  cash_reserve_cents: number | string;
  fee_cents: number | string;
  wire_fee_cents: number | string;
  advance_cents: number | string;
  net_to_company_cents: number | string;
  factoring_advance_id: string | null;
  journal_entry_id: string | null;
  factoring_company_name: string | null;
};

export function createFactoringPurchase(companyId: string, body: CreateFactoringPurchaseBody) {
  return apiRequest<FactoringPurchaseDetail>(`/api/v1/factoring/purchases?${q(companyId)}`, { method: "POST", body });
}

export function postFactoringPurchase(companyId: string, purchaseId: string) {
  return apiRequest<FactoringPurchaseDetail>(`/api/v1/factoring/purchases/${encodeURIComponent(purchaseId)}/post?${q(companyId)}`, {
    method: "POST",
    body: {},
  });
}

export function voidFactoringPurchase(companyId: string, purchaseId: string, reason: string) {
  return apiRequest<FactoringPurchaseDetail>(`/api/v1/factoring/purchases/${encodeURIComponent(purchaseId)}/void?${q(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}

export type SendFactoringPurchaseResult = {
  sent: boolean;
  purchase_id: string;
  display_id: string;
  to: string;
  email_queue_id: string;
  attachments: number;
  linked_documents: number;
};

export function sendFactoringPurchase(companyId: string, purchaseId: string, toEmail?: string | null, docsOverrideReason?: string | null) {
  const body: Record<string, string> = {};
  if (toEmail) body.to_email = toEmail;
  // Owner override approval: send although loads are missing BOL / POD / rate confirmation (reason >= 10 chars).
  if (docsOverrideReason && docsOverrideReason.trim().length >= 10) body.docs_override_reason = docsOverrideReason.trim();
  return apiRequest<SendFactoringPurchaseResult>(`/api/v1/factoring/purchases/${encodeURIComponent(purchaseId)}/send?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

/** Feed Gate red row as returned in a 409 feed_gate_blocked from POST /factoring/purchases. */
export type FeedGateRed = { check_key: string; check_group: string; subject_label: string | null; missing: string | null; fix_link: string | null };
export type FeedGateBlocked = { invoice_id: string; passed: boolean; intake_id: string | null; error: string | null; reds: FeedGateRed[] };
