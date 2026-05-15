import { apiRequest, apiRequestFormData } from "./client";

export function getVendorApSummary(vendorId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ap_open_cents: number; bills_paid_count: number; last_payment_date: string | null }>(
    `/api/v1/vendors/${encodeURIComponent(vendorId)}/ap-summary?${q}`
  );
}

export function getVendorCoi(vendorId: string) {
  return apiRequest<{
    coi_pdf_r2_key: string | null;
    coi_expires_on: string | null;
    net_terms_days: number | null;
    default_payment_method: string | null;
  }>(`/api/v1/vendors/${encodeURIComponent(vendorId)}/coi`);
}

export function getVendorW9(vendorId: string) {
  return apiRequest<{ w9_pdf_r2_key: string | null; tax_id: string | null }>(`/api/v1/vendors/${encodeURIComponent(vendorId)}/w9`);
}

export function postVendorCoiUpload(vendorId: string, file: File, coiExpiresOn: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("coi_expires_on", coiExpiresOn);
  return apiRequestFormData<{ ok: true; coi_pdf_r2_key: string; coi_expires_on: string }>(
    `/api/v1/vendors/${encodeURIComponent(vendorId)}/coi`,
    fd
  );
}

export function postVendorW9Upload(vendorId: string, file: File, taxId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (taxId) fd.append("tax_id", taxId);
  return apiRequestFormData<{ ok: true; w9_pdf_r2_key: string }>(`/api/v1/vendors/${encodeURIComponent(vendorId)}/w9`, fd);
}

export function postVendorPaymentTerms(vendorId: string, body: { operating_company_id: string; net_terms_days: number; default_payment_method: string }) {
  return apiRequest<{ ok: true }>(`/api/v1/vendors/${encodeURIComponent(vendorId)}/payment-terms`, { method: "POST", body });
}
