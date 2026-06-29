import { apiRequest } from "./client";

// FIN-20 — AR / AP aging (READ-ONLY, Finance Hub). Behind the OFF-by-default AR_AP_AGING_UI_ENABLED
// flag (resolved client-side via useFeatureFlag, enforced server-side via process.env). Money is
// integer cents. Buckets mirror views.ar_aging / views.ap_aging exactly.
export const AR_AP_AGING_UI_FLAG = "AR_AP_AGING_UI_ENABLED";

export type AgingBuckets = {
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  total_open_cents: number;
};

export type ArAgingCustomerRow = AgingBuckets & {
  customer_id: string;
  customer_name: string;
  open_invoice_count: number;
};

export type ApAgingVendorRow = AgingBuckets & {
  vendor_id: string;
  vendor_name: string;
  open_bill_count: number;
};

export type ArAgingSummary = {
  as_of_date: string;
  customers: ArAgingCustomerRow[];
  totals: AgingBuckets;
};

export type ApAgingSummary = {
  as_of_date: string;
  vendors: ApAgingVendorRow[];
  totals: AgingBuckets;
};

export type ArAgingInvoiceRow = {
  invoice_id: string;
  display_id: string;
  status: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
  amount_open_cents: number;
  days_overdue: number;
};

export type ApAgingBillRow = {
  bill_id: string;
  bill_number: string | null;
  status: string;
  bill_date: string;
  due_date: string | null;
  memo: string | null;
  amount_cents: number;
  paid_cents: number;
  open_cents: number;
  days_overdue: number;
};

function withCompany(path: string, operatingCompanyId: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function getArAging(operatingCompanyId: string, asOfDate: string) {
  return apiRequest<ArAgingSummary>(
    withCompany(`/api/v1/accounting/fin20/ar-aging?as_of_date=${encodeURIComponent(asOfDate)}`, operatingCompanyId)
  );
}

export function getApAging(operatingCompanyId: string, asOfDate: string) {
  return apiRequest<ApAgingSummary>(
    withCompany(`/api/v1/accounting/fin20/ap-aging?as_of_date=${encodeURIComponent(asOfDate)}`, operatingCompanyId)
  );
}

export function getArAgingInvoices(operatingCompanyId: string, customerId: string, asOfDate: string) {
  return apiRequest<{ invoices: ArAgingInvoiceRow[] }>(
    withCompany(
      `/api/v1/accounting/fin20/ar-aging/invoices?customer_id=${encodeURIComponent(customerId)}&as_of_date=${encodeURIComponent(asOfDate)}`,
      operatingCompanyId
    )
  );
}

export function getApAgingBills(operatingCompanyId: string, vendorId: string, asOfDate: string) {
  return apiRequest<{ bills: ApAgingBillRow[] }>(
    withCompany(
      `/api/v1/accounting/fin20/ap-aging/bills?vendor_id=${encodeURIComponent(vendorId)}&as_of_date=${encodeURIComponent(asOfDate)}`,
      operatingCompanyId
    )
  );
}
