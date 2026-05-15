import { apiRequest } from "./client";

/** Wave 2 / accounting read models; optional fields appear when backend extends list payloads. */
export type AccountingCustomerListRow = {
  id: string;
  display_name: string;
  qbo_id?: string | null;
  email?: string | null;
  phone?: string | null;
  open_invoice_count?: number | null;
  open_balance_cents?: number | null;
  total_billed_ytd_cents?: number | null;
  category?: string | null;
  last_invoice_date?: string | null;
};

export type AccountingVendorListRow = {
  id: string;
  display_name: string;
  qbo_id?: string | null;
  email?: string | null;
  phone?: string | null;
  open_bill_count?: number | null;
  open_balance_cents?: number | null;
  total_spent_ytd_cents?: number | null;
  category?: string | null;
  eligible_1099?: boolean | null;
  last_bill_date?: string | null;
};

export type AccountingCustomerDetail = AccountingCustomerListRow & {
  billing_address?: string | null;
  shipping_address?: string | null;
  shipping_same_as_billing?: boolean;
  notes?: string | null;
  open_balance_cents?: number | null;
  overdue_balance_cents?: number | null;
};

function normalizeCustomerItem(raw: Record<string, unknown>): AccountingCustomerListRow {
  return {
    id: String(raw.id ?? ""),
    display_name: String(raw.display_name ?? raw.name ?? ""),
    qbo_id: raw.qbo_id != null ? String(raw.qbo_id) : null,
    email: raw.email != null ? String(raw.email) : null,
    phone: raw.phone != null ? String(raw.phone) : null,
    open_invoice_count: raw.open_invoice_count != null ? Number(raw.open_invoice_count) : null,
    open_balance_cents: raw.open_balance_cents != null ? Number(raw.open_balance_cents) : null,
    total_billed_ytd_cents: raw.total_billed_ytd_cents != null ? Number(raw.total_billed_ytd_cents) : null,
    category: raw.category != null ? String(raw.category) : null,
    last_invoice_date: raw.last_invoice_date != null ? String(raw.last_invoice_date) : null,
  };
}

function normalizeVendorItem(raw: Record<string, unknown>): AccountingVendorListRow {
  return {
    id: String(raw.id ?? ""),
    display_name: String(raw.display_name ?? raw.name ?? ""),
    qbo_id: raw.qbo_id != null ? String(raw.qbo_id) : null,
    email: raw.email != null ? String(raw.email) : null,
    phone: raw.phone != null ? String(raw.phone) : null,
    open_bill_count: raw.open_bill_count != null ? Number(raw.open_bill_count) : null,
    open_balance_cents: raw.open_balance_cents != null ? Number(raw.open_balance_cents) : null,
    total_spent_ytd_cents: raw.total_spent_ytd_cents != null ? Number(raw.total_spent_ytd_cents) : null,
    category: raw.category != null ? String(raw.category) : null,
    eligible_1099: raw.eligible_1099 != null ? Boolean(raw.eligible_1099) : null,
    last_bill_date: raw.last_bill_date != null ? String(raw.last_bill_date) : null,
  };
}

export async function listAccountingCustomers(
  operatingCompanyId: string,
  params: {
    category?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.category?.trim()) q.set("category", params.category.trim());
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit != null) q.set("limit", String(params.limit));
  const res = await apiRequest<{ items: Array<Record<string, unknown>>; next_cursor?: string | null }>(
    `/api/v1/accounting/customers?${q}`
  );
  return {
    items: (res.items ?? []).map(normalizeCustomerItem),
    next_cursor: res.next_cursor ?? null,
  };
}

export async function getAccountingCustomer(id: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  const raw = await apiRequest<Record<string, unknown>>(`/api/v1/accounting/customers/${encodeURIComponent(id)}?${q}`);
  const base = normalizeCustomerItem(raw);
  return {
    ...base,
    billing_address: raw.billing_address != null ? String(raw.billing_address) : null,
    shipping_address: raw.shipping_address != null ? String(raw.shipping_address) : null,
    shipping_same_as_billing: raw.shipping_same_as_billing != null ? Boolean(raw.shipping_same_as_billing) : undefined,
    notes: raw.notes != null ? String(raw.notes) : null,
    overdue_balance_cents: raw.overdue_balance_cents != null ? Number(raw.overdue_balance_cents) : null,
  };
}

export async function listAccountingVendors(
  operatingCompanyId: string,
  params: {
    category?: string;
    eligible_1099?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
  } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.category?.trim()) q.set("category", params.category.trim());
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.eligible_1099 === true) q.set("eligible_1099", "true");
  if (params.eligible_1099 === false) q.set("eligible_1099", "false");
  const res = await apiRequest<{ items: Array<Record<string, unknown>>; next_cursor?: string | null }>(
    `/api/v1/accounting/vendors?${q}`
  );
  return {
    items: (res.items ?? []).map(normalizeVendorItem),
    next_cursor: res.next_cursor ?? null,
  };
}

export async function getAccountingVendor(id: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  const raw = await apiRequest<Record<string, unknown>>(`/api/v1/accounting/vendors/${encodeURIComponent(id)}?${q}`);
  const base = normalizeVendorItem(raw);
  return {
    ...base,
    billing_address: raw.billing_address != null ? String(raw.billing_address) : null,
    tax_id_masked: raw.tax_id_masked != null ? String(raw.tax_id_masked) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
  };
}
