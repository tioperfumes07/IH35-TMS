import { apiRequest } from "./client";

export type VendorCreditStatus = "open" | "applied" | "voided";

export type VendorCredit = {
  id: string;
  vendor_id: string;
  /** ACCT-F5061 — joined from mdata.vendors (same-opco); list/detail EntityLink label. */
  vendor_name?: string | null;
  display_id: string;
  status: VendorCreditStatus;
  issue_date: string;
  amount_cents: number;
  amount_applied_cents: number;
  amount_unapplied_cents: number;
  notes: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

export type VendorCreditApplication = {
  id: string;
  bill_id: string;
  bill_number: string | null;
  applied_cents: number;
  applied_at: string;
  voided_at: string | null;
};

export type CreditLimitExceededError = {
  error: "credit_limit_exceeded";
  exposure_cents: number;
  limit_cents: number;
  credit_limit_source: "factor" | "manual" | "rmis_future" | null;
  can_override: boolean;
  new_load_cents?: number;
};

export function getNextVendorCreditDocumentNumber(operatingCompanyId: string) {
  return apiRequest<{ document_number: string }>(
    `/api/v1/accounting/vendor-credits/next-number?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function listVendorCredits(
  operatingCompanyId: string,
  params: { vendor_id?: string; status?: VendorCreditStatus }
): Promise<{ credits: VendorCredit[] }> {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.vendor_id) qs.set("vendor_id", params.vendor_id);
  if (params.status) qs.set("status", params.status);
  return apiRequest<{ credits: VendorCredit[] }>(`/api/v1/accounting/vendor-credits?${qs.toString()}`);
}

export function createVendorCredit(
  operatingCompanyId: string,
  payload: { vendor_id: string; issue_date?: string; amount_cents: number; notes?: string }
): Promise<VendorCredit> {
  return apiRequest<VendorCredit>(
    `/api/v1/accounting/vendor-credits?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: payload }
  );
}

export function getVendorCredit(
  operatingCompanyId: string,
  creditId: string
): Promise<{ credit: VendorCredit; applications: VendorCreditApplication[] }> {
  return apiRequest<{ credit: VendorCredit; applications: VendorCreditApplication[] }>(
    `/api/v1/accounting/vendor-credits/${encodeURIComponent(creditId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function applyVendorCredit(
  operatingCompanyId: string,
  creditId: string,
  applications: Array<{ bill_id: string; applied_cents: number }>
): Promise<{ applicationIds: string[] }> {
  return apiRequest<{ applicationIds: string[] }>(
    `/api/v1/accounting/vendor-credits/${encodeURIComponent(creditId)}/apply?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: { applications } }
  );
}

export function voidVendorCredit(
  operatingCompanyId: string,
  creditId: string,
  reason: string
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/accounting/vendor-credits/${encodeURIComponent(creditId)}/void?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: { reason } }
  );
}
