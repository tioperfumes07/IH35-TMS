import { apiRequest } from "./client";

// ACCT-F5606 — AR mirror of api/vendor-credits.ts's proven AP shape.

export type CreditMemoStatus = "draft" | "issued" | "applied" | "voided";
export type CreditMemoReason = "damage" | "shortage" | "rate_dispute" | "duplicate_billing" | "detention_dispute" | "other";

export const CREDIT_MEMO_REASONS: Array<{ value: CreditMemoReason; label: string }> = [
  { value: "damage", label: "Damage" },
  { value: "shortage", label: "Shortage" },
  { value: "rate_dispute", label: "Rate dispute" },
  { value: "duplicate_billing", label: "Duplicate billing" },
  { value: "detention_dispute", label: "Detention dispute" },
  { value: "other", label: "Other" },
];

export type CreditMemo = {
  id: string;
  customer_id: string;
  /** Joined from mdata.customers (same-opco); list/detail EntityLink label. */
  customer_name?: string | null;
  display_id: string;
  status: CreditMemoStatus;
  reason: CreditMemoReason;
  issue_date: string;
  amount_cents: number;
  amount_applied_cents: number;
  amount_unapplied_cents: number;
  notes: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

export type CreditMemoApplication = {
  id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  applied_cents: number;
  applied_at: string;
  voided_at: string | null;
};

export function listCreditMemos(
  operatingCompanyId: string,
  params: { customer_id?: string; status?: CreditMemoStatus }
): Promise<{ credit_memos: CreditMemo[] }> {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.customer_id) qs.set("customer_id", params.customer_id);
  if (params.status) qs.set("status", params.status);
  return apiRequest<{ credit_memos: CreditMemo[] }>(`/api/v1/accounting/credit-memos?${qs.toString()}`);
}

export function createCreditMemo(
  operatingCompanyId: string,
  payload: { customer_id: string; issue_date?: string; amount_cents: number; reason: CreditMemoReason; notes?: string }
): Promise<CreditMemo> {
  return apiRequest<CreditMemo>(
    `/api/v1/accounting/credit-memos?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: payload }
  );
}

export function getCreditMemo(
  operatingCompanyId: string,
  creditMemoId: string
): Promise<{ credit_memo: CreditMemo; applications: CreditMemoApplication[] }> {
  return apiRequest<{ credit_memo: CreditMemo; applications: CreditMemoApplication[] }>(
    `/api/v1/accounting/credit-memos/${encodeURIComponent(creditMemoId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function applyCreditMemo(
  operatingCompanyId: string,
  creditMemoId: string,
  applications: Array<{ invoice_id: string; applied_cents: number }>
): Promise<{ applicationIds: string[] }> {
  return apiRequest<{ applicationIds: string[] }>(
    `/api/v1/accounting/credit-memos/${encodeURIComponent(creditMemoId)}/apply?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: { applications } }
  );
}

export function voidCreditMemo(
  operatingCompanyId: string,
  creditMemoId: string,
  reason: string
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/accounting/credit-memos/${encodeURIComponent(creditMemoId)}/void?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: { reason } }
  );
}
