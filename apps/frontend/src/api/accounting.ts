import { apiRequest } from "./client";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void" | "factored";
export type InvoiceLineType = "linehaul" | "fsc" | "detention" | "layover" | "lumper" | "tonu" | "accessorial" | "tax" | "adjustment" | "other";
export type PaymentMethod = "ach" | "wire" | "check" | "cash" | "factoring_advance" | "factoring_reserve" | "credit_card" | "other";

export type InvoiceLine = {
  id: string;
  operating_company_id: string;
  invoice_id: string;
  source_load_id: string | null;
  line_type: InvoiceLineType;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
  qbo_class_snapshot: string | null;
  qbo_item_id: string | null;
  display_order: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  customer_name?: string | null;
  display_id: string;
  status: InvoiceStatus;
  source_load_id: string | null;
  issue_date: string;
  due_date: string;
  sent_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  amount_open_cents: number;
  payment_terms_label: string | null;
  payment_terms_days: number | null;
  internal_notes: string | null;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  lines?: InvoiceLine[];
  payment_applications?: Array<{
    id: string;
    payment_id: string;
    amount_cents: number;
    applied_at: string;
    payment_display_id?: string | null;
    payment_date?: string | null;
  }>;
};

export type Payment = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  customer_name: string;
  display_id: string;
  payment_method: PaymentMethod;
  payment_date: string;
  reference: string | null;
  amount_cents: number;
  amount_applied_cents: number;
  amount_unapplied_cents: number;
  deposited_to_account_id: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export type PaymentApplication = {
  id: string;
  payment_id: string;
  invoice_id: string;
  invoice_display_id: string;
  invoice_amount_open_cents: number;
  amount_cents: number;
  applied_at: string;
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function listInvoices(operatingCompanyId: string, params: { status?: string; search?: string; customer_id?: string; from_date?: string; to_date?: string } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.customer_id) query.set("customer_id", params.customer_id);
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  const qs = query.toString();
  return apiRequest<{ invoices: Invoice[] }>(withCompany(`/api/v1/accounting/invoices${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function getInvoice(id: string, operatingCompanyId: string) {
  return apiRequest<Invoice>(withCompany(`/api/v1/accounting/invoices/${id}`, operatingCompanyId));
}

export function createInvoice(
  operatingCompanyId: string,
  payload: {
    customer_id: string;
    issue_date?: string;
    due_date?: string;
    payment_terms_id?: string;
    internal_notes?: string;
    customer_notes?: string;
    currency_code?: "USD" | "MXN";
  }
) {
  return apiRequest<Invoice>(withCompany("/api/v1/accounting/invoices", operatingCompanyId), { method: "POST", body: payload });
}

export function createInvoiceFromLoad(operatingCompanyId: string, payload: { load_id: string }) {
  return apiRequest<{ invoice: Invoice; line: InvoiceLine; idempotent: boolean }>(withCompany("/api/v1/accounting/invoices/from-load", operatingCompanyId), {
    method: "POST",
    body: payload,
  });
}

export function patchInvoice(id: string, operatingCompanyId: string, payload: Partial<{
  issue_date: string;
  due_date: string;
  delivery_date: string | null;
  payment_terms_id: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  ar_email_snapshot: string | null;
  ar_phone_snapshot: string | null;
  currency_code: "USD" | "MXN";
}>) {
  return apiRequest<Invoice>(withCompany(`/api/v1/accounting/invoices/${id}`, operatingCompanyId), { method: "PATCH", body: payload });
}

export function sendInvoice(id: string, operatingCompanyId: string) {
  return apiRequest<Invoice>(withCompany(`/api/v1/accounting/invoices/${id}/send`, operatingCompanyId), { method: "POST" });
}

export function voidInvoice(id: string, operatingCompanyId: string, reason?: string) {
  return apiRequest<Invoice>(withCompany(`/api/v1/accounting/invoices/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { reason },
  });
}

export function addInvoiceLine(
  invoiceId: string,
  operatingCompanyId: string,
  payload: {
    line_type: InvoiceLineType;
    description: string;
    quantity: number;
    unit_amount_cents: number;
    source_load_id?: string;
    qbo_class_snapshot?: string;
    qbo_item_id?: string;
    display_order?: number;
  }
) {
  return apiRequest<{ line: InvoiceLine }>(withCompany(`/api/v1/accounting/invoices/${invoiceId}/lines`, operatingCompanyId), {
    method: "POST",
    body: payload,
  });
}

export function patchInvoiceLine(
  invoiceId: string,
  lineId: string,
  operatingCompanyId: string,
  payload: Partial<{
    line_type: InvoiceLineType;
    description: string;
    quantity: number;
    unit_amount_cents: number;
    source_load_id: string | null;
    qbo_class_snapshot: string | null;
    qbo_item_id: string | null;
    display_order: number;
  }>
) {
  return apiRequest<{ line: InvoiceLine }>(withCompany(`/api/v1/accounting/invoices/${invoiceId}/lines/${lineId}`, operatingCompanyId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteInvoiceLine(invoiceId: string, lineId: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/invoices/${invoiceId}/lines/${lineId}`, operatingCompanyId), {
    method: "DELETE",
  });
}

export function listPayments(
  operatingCompanyId: string,
  filters: {
    status?: "active" | "voided" | "all";
    customer_id?: string;
    payment_method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.customer_id) query.set("customer_id", filters.customer_id);
  if (filters.payment_method) query.set("payment_method", filters.payment_method);
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  if (filters.search) query.set("search", filters.search);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  const qs = query.toString();
  return apiRequest<{ rows: Payment[]; total: number }>(withCompany(`/api/v1/accounting/payments${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function getPayment(id: string, operatingCompanyId: string) {
  return apiRequest<Payment & { applications: PaymentApplication[] }>(withCompany(`/api/v1/accounting/payments/${id}`, operatingCompanyId));
}

export function createPayment(
  operatingCompanyId: string,
  body: {
    customer_id: string;
    payment_method: PaymentMethod;
    payment_date: string;
    reference?: string;
    amount_cents: number;
    deposited_to_account_id?: string;
    notes?: string;
    apply_to?: Array<{ invoice_id: string; amount_cents: number }>;
  }
) {
  return apiRequest<{ id: string; display_id: string; amount_unapplied_cents: number; applications_count: number }>(
    withCompany("/api/v1/accounting/payments", operatingCompanyId),
    { method: "POST", body }
  );
}

export function voidPayment(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<Payment & { applications: PaymentApplication[] }>(withCompany(`/api/v1/accounting/payments/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { void_reason: reason },
  });
}

export function applyPayment(
  paymentId: string,
  operatingCompanyId: string,
  body: {
    invoice_id: string;
    amount_cents: number;
  }
) {
  return apiRequest<{
    id: string;
    payment_amount_unapplied_cents: number;
    invoice_amount_open_cents: number;
    invoice_status: string;
  }>(withCompany(`/api/v1/accounting/payments/${paymentId}/applications`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function unapplyPayment(paymentId: string, applicationId: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/payments/${paymentId}/applications/${applicationId}`, operatingCompanyId), {
    method: "DELETE",
  });
}
