import { apiRequest } from "./client";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void" | "factored";
export type InvoiceLineType = "linehaul" | "fsc" | "detention" | "layover" | "lumper" | "tonu" | "accessorial" | "tax" | "adjustment" | "other";
export type PaymentMethod = "ach" | "wire" | "check" | "cash" | "factoring_advance" | "factoring_reserve" | "credit_card" | "other";
export type FactoringStatus = "submitted" | "advanced" | "reserve_held" | "collected" | "released" | "recourse_returned" | "voided";

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
  source_load_chargeback_requested?: boolean;
  source_load_chargeback_reason?: string | null;
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
  factoring_advance_id?: string | null;
  factoring_display_id?: string | null;
  factoring_status?: "not_factored" | "submitted" | "advanced" | "reserve_held" | "collected" | "released" | "recourse_returned";
  payment_terms_label: string | null;
  payment_terms_days: number | null;
  invoice_type?: "from_load" | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual";
  bill_to_entity_type?: "customer" | "driver" | "vendor" | "other" | null;
  bill_to_entity_id?: string | null;
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

export type FactoringAdvance = {
  id: string;
  operating_company_id: string;
  factoring_company_vendor_id: string;
  factoring_company_name: string;
  display_id: string;
  status: FactoringStatus;
  submitted_at: string;
  submission_batch_ref: string | null;
  invoice_total_cents: number;
  advance_rate_pct: number;
  advance_amount_cents: number;
  reserve_pct: number;
  reserve_amount_cents: number;
  factor_fee_pct: number;
  factor_fee_cents: number;
  release_amount_cents: number;
  advanced_at: string | null;
  collected_at: string | null;
  released_at: string | null;
  recourse_returned_at: string | null;
  recourse_reason: string | null;
  notes: string | null;
  invoice_count: number;
};

export type FactoringAdvanceDetail = FactoringAdvance & {
  invoices: Array<{
    id: string;
    display_id: string;
    customer_id: string;
    customer_name: string;
    issue_date: string;
    total_cents: number;
    factoring_status: string;
  }>;
};

export type FactorReserveBalance = {
  customer_id: string;
  customer_name: string;
  reserve_balance_cents: number;
  reserve_accrued_cents: number;
  reserve_released_cents: number;
};

export type FactorReserveEvent = {
  factoring_advance_id: string;
  display_id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  reserve_amount_cents: number;
  release_amount_cents: number;
  factor_fee_cents: number;
  occurred_at: string;
};

export type FactorReconciliationRun = {
  id: string;
  operating_company_id: string;
  factor_id: string;
  statement_date: string;
  status: "open" | "closed";
  total_advances_cents: number;
  total_fees_cents: number;
  total_reserves_released_cents: number;
  source_daily_import_id: string | null;
  created_at: string;
  item_count?: number;
  mismatch_count?: number;
};

export type FactorReconciliationItem = {
  id: string;
  run_id: string;
  operating_company_id: string;
  invoice_id: string | null;
  statement_invoice_number: string | null;
  ledger_match_state: "matched" | "missing_in_ledger" | "missing_on_statement" | "amount_mismatch";
  factor_amount_cents: number;
  ledger_amount_cents: number;
  variance_cents: number;
  tolerance_cents: number;
  details: Record<string, unknown> | null;
  created_at: string;
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
  invoice_id: string | null;
  target_kind?: "invoice" | "bill" | "credit_memo";
  target_id?: string;
  invoice_display_id: string | null;
  invoice_amount_open_cents: number | null;
  amount_cents: number;
  amount_applied?: number;
  applied_at: string;
};

export type VendorBalance = {
  operating_company_id: string;
  vendor_id: string;
  vendor_name: string;
  balance_cents: number;
  open_bill_count: number;
  next_due_date: string | null;
  last_bill_date: string | null;
};

export type BillStatus = "open" | "partial" | "paid" | "voided";
export type BillPaymentMethod = "check" | "ach" | "wire" | "cash" | "credit_card";

export type VendorBill = {
  id: string;
  operating_company_id: string;
  vendor_id: string | null;
  vendor_name?: string | null;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  amount_cents: number;
  paid_cents: number;
  balance_cents?: number;
  status: BillStatus;
  memo: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export type BillPayment = {
  id: string;
  operating_company_id: string;
  bill_id: string;
  vendor_id: string | null;
  payment_date: string;
  amount_cents: number;
  payment_method: BillPaymentMethod;
  from_bank_account_id: string | null;
  check_number: string | null;
  reference_number: string | null;
  memo: string | null;
  created_by_user_id: string | null;
  created_at: string;
  revoked_at: string | null;
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

type ExpandedInvoiceBody = {
  customer_id: string;
  bill_to_entity_type: "customer" | "driver" | "vendor" | "other";
  bill_to_entity_id?: string | null;
  issue_date?: string;
  due_date?: string;
  internal_notes?: string;
  customer_notes?: string;
  auto_deduct_settlement?: boolean;
};

function createExpandedInvoice(path: string, operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return apiRequest<Invoice>(withCompany(path, operatingCompanyId), { method: "POST", body: payload });
}

export function createDriverDamageInvoice(operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return createExpandedInvoice("/api/v1/accounting/invoices/driver-damage", operatingCompanyId, payload);
}

export function createDriverMiscInvoice(operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return createExpandedInvoice("/api/v1/accounting/invoices/driver-misc", operatingCompanyId, payload);
}

export function createVendorChargebackInvoice(operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return createExpandedInvoice("/api/v1/accounting/invoices/vendor-chargeback", operatingCompanyId, payload);
}

export function createCustomerAdjustmentInvoice(operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return createExpandedInvoice("/api/v1/accounting/invoices/customer-adjustment", operatingCompanyId, payload);
}

export function createManualInvoice(operatingCompanyId: string, payload: ExpandedInvoiceBody) {
  return createExpandedInvoice("/api/v1/accounting/invoices/manual", operatingCompanyId, payload);
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

export function listVendorBalances(
  operatingCompanyId: string,
  params: { all?: boolean; sort?: "balance_desc" | "balance_asc" | "vendor_asc" } = {}
) {
  const query = new URLSearchParams();
  if (params.all !== undefined) query.set("all", String(params.all));
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return apiRequest<{ rows: VendorBalance[] }>(withCompany(`/api/v1/accounting/vendor-balances${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function listVendorBills(
  operatingCompanyId: string,
  params: {
    vendor_id: string;
    status?: BillStatus | "unpaid";
    include_balance?: boolean;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }
) {
  const query = new URLSearchParams();
  query.set("vendor_id", params.vendor_id);
  if (params.status) query.set("status", params.status);
  if (params.include_balance !== undefined) query.set("include_balance", String(params.include_balance));
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ rows: VendorBill[] }>(withCompany(`/api/v1/accounting/bills?${qs}`, operatingCompanyId));
}

/** All vendors when `vendor_id` omitted; supports balance columns from list API. */
export function listBills(
  operatingCompanyId: string,
  params: {
    vendor_id?: string;
    status?: BillStatus | "unpaid";
    include_balance?: boolean;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (params.vendor_id) query.set("vendor_id", params.vendor_id);
  if (params.status) query.set("status", params.status);
  if (params.include_balance !== undefined) query.set("include_balance", String(params.include_balance));
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ rows: VendorBill[] }>(withCompany(`/api/v1/accounting/bills?${qs}`, operatingCompanyId));
}

export function listBillPayments(
  operatingCompanyId: string,
  params: {
    vendor_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (params.vendor_id) query.set("vendor_id", params.vendor_id);
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ rows: BillPayment[] }>(withCompany(`/api/v1/accounting/bill-payments${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function listPaymentsForBill(billId: string, operatingCompanyId: string) {
  return apiRequest<{ payments: BillPayment[] }>(withCompany(`/api/v1/accounting/bills/${billId}/payments`, operatingCompanyId));
}

export function getVendorBill(id: string, operatingCompanyId: string) {
  return apiRequest<{ bill: VendorBill; payments: BillPayment[]; audit_events: Array<Record<string, unknown>> }>(
    withCompany(`/api/v1/accounting/bills/${id}`, operatingCompanyId)
  );
}

export function payVendorBill(
  id: string,
  operatingCompanyId: string,
  body: {
    payment_date: string;
    amount_cents: number;
    payment_method: BillPaymentMethod;
    from_bank_account_id?: string;
    check_number?: string;
    reference_number?: string;
    memo?: string;
  }
) {
  return apiRequest<{ payment: BillPayment }>(withCompany(`/api/v1/accounting/bills/${id}/pay`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function voidVendorBill(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/bills/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { reason },
  });
}

export function createVendorBill(
  operatingCompanyId: string,
  body: {
    vendor_id: string;
    bill_number?: string;
    bill_date: string;
    due_date?: string;
    amount_cents: number;
    memo?: string;
    coa_account_id?: string;
  }
) {
  return apiRequest<{ bill: VendorBill }>(withCompany(`/api/v1/accounting/bills`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function voidVendorBillPayment(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/bill-payments/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { reason },
  });
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
    invoice_id?: string;
    target_kind?: "invoice" | "bill";
    target_id?: string;
    amount_cents: number;
  }
) {
  return apiRequest<{
    id: string;
    payment_amount_unapplied_cents: number;
    invoice_amount_open_cents: number;
    invoice_status: string;
    overpayment_credit_memo_display_id?: string | null;
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

export function listFactoringAdvances(
  operatingCompanyId: string,
  filters: {
    status?: FactoringStatus | "all";
    factoring_company_vendor_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    limit?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.factoring_company_vendor_id) query.set("factoring_company_vendor_id", filters.factoring_company_vendor_id);
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  if (filters.search) query.set("search", filters.search);
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  const qs = query.toString();
  return apiRequest<{ rows: FactoringAdvance[] }>(withCompany(`/api/v1/accounting/factoring-advances${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function getFactoringAdvance(id: string, operatingCompanyId: string) {
  return apiRequest<FactoringAdvanceDetail>(withCompany(`/api/v1/accounting/factoring-advances/${id}`, operatingCompanyId));
}

export function listFactoringReserveBalances(operatingCompanyId: string) {
  return apiRequest<{
    rows: FactorReserveBalance[];
    recent_events: FactorReserveEvent[];
  }>(withCompany("/api/v1/accounting/factoring-reserve-balances", operatingCompanyId));
}

export function listFactorReconciliationRuns(
  operatingCompanyId: string,
  params: { factor_id?: string; limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.factor_id) query.set("factor_id", params.factor_id);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ rows: FactorReconciliationRun[] }>(
    withCompany(`/api/v1/accounting/factor-reconciliation/runs${qs ? `?${qs}` : ""}`, operatingCompanyId)
  );
}

export function listFactorReconciliationItems(runId: string, operatingCompanyId: string) {
  return apiRequest<{ rows: FactorReconciliationItem[] }>(
    withCompany(`/api/v1/accounting/factor-reconciliation/runs/${runId}/items`, operatingCompanyId)
  );
}

export function listFactorReconciliationImportCandidates(
  operatingCompanyId: string,
  params: { limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{
    rows: Array<{
      id: string;
      statement_date: string;
      statement_reference: string;
      source_filename: string | null;
      imported_at: string;
      advance_total_cents: number;
      fee_total_cents: number;
      reserve_total_cents: number;
      factor_id: string | null;
      factor_name: string | null;
    }>;
  }>(withCompany(`/api/v1/accounting/factor-reconciliation/import-candidates${qs ? `?${qs}` : ""}`, operatingCompanyId));
}

export function importFactorReconciliationRun(
  operatingCompanyId: string,
  body: { factor_id: string; daily_import_id: string }
) {
  return apiRequest<{ run: FactorReconciliationRun }>("/api/v1/accounting/factor-reconciliation/import", {
    method: "POST",
    body: {
      operating_company_id: operatingCompanyId,
      factor_id: body.factor_id,
      daily_import_id: body.daily_import_id,
    },
  });
}

export function listFactoringCandidateInvoices(operatingCompanyId: string) {
  return apiRequest<{
    rows: Array<{
      id: string;
      display_id: string;
      customer_id: string;
      customer_name: string;
      issue_date: string;
      total_cents: number;
      factoring_status: string;
      customer_recourse_type: string;
      factoring_eligible: boolean;
    }>;
  }>(withCompany("/api/v1/accounting/factoring-advances/candidate-invoices", operatingCompanyId));
}

export function submitFactoringBatch(
  operatingCompanyId: string,
  body: {
    factoring_company_vendor_id: string;
    submission_batch_ref?: string;
    invoice_ids: string[];
    advance_rate_pct: number;
    reserve_pct: number;
    factor_fee_pct?: number;
    notes?: string;
  }
) {
  return apiRequest<FactoringAdvanceDetail>(withCompany("/api/v1/accounting/factoring-advances", operatingCompanyId), { method: "POST", body });
}

export function markAdvanced(id: string, operatingCompanyId: string, body: { advanced_at?: string; notes?: string } = {}) {
  return apiRequest<FactoringAdvanceDetail>(withCompany(`/api/v1/accounting/factoring-advances/${id}/advance`, operatingCompanyId), { method: "POST", body });
}

export function markReserveHeld(id: string, operatingCompanyId: string, body: { collected_at?: string; notes?: string } = {}) {
  return apiRequest<FactoringAdvanceDetail>(withCompany(`/api/v1/accounting/factoring-advances/${id}/reserve-held`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function releaseReserve(
  id: string,
  operatingCompanyId: string,
  body: { released_at?: string; factor_fee_cents: number; release_amount_cents: number; notes?: string }
) {
  return apiRequest<FactoringAdvanceDetail>(withCompany(`/api/v1/accounting/factoring-advances/${id}/release`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function recourseReturn(id: string, operatingCompanyId: string, body: { recourse_returned_at?: string; recourse_reason: string }) {
  return apiRequest<FactoringAdvanceDetail>(withCompany(`/api/v1/accounting/factoring-advances/${id}/recourse-return`, operatingCompanyId), {
    method: "POST",
    body,
  });
}

export function voidFactoring(id: string, operatingCompanyId: string, reason?: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/factoring-advances/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { reason },
  });
}

export type JournalEntrySource = "manual" | "auto";
export type JournalEntryStatus = "posted" | "voided";
export type JournalEntryPosting = {
  id: string;
  journal_entry_uuid: string;
  line_sequence: number;
  account_id: string;
  account_number?: string | null;
  account_name?: string | null;
  class_id: string | null;
  class_name?: string | null;
  entity_uuid: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
};

export type JournalEntry = {
  id: string;
  operating_company_id: string;
  entry_date: string;
  memo: string | null;
  status: JournalEntryStatus;
  source: JournalEntrySource;
  created_by_user_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  qbo_journal_entry_id: string | null;
  qbo_sync_pending: boolean;
  debit_total_cents?: number;
  credit_total_cents?: number;
  postings?: JournalEntryPosting[];
  created_at: string;
  updated_at: string;
};

export function listJournalEntries(
  operatingCompanyId: string,
  params: {
    source?: JournalEntrySource;
    status?: JournalEntryStatus;
    account_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (params.source) query.set("source", params.source);
  if (params.status) query.set("status", params.status);
  if (params.account_id) query.set("account_id", params.account_id);
  if (params.from_date) query.set("from_date", params.from_date);
  if (params.to_date) query.set("to_date", params.to_date);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ journal_entries: JournalEntry[] }>(
    withCompany(`/api/v1/accounting/journal-entries${qs ? `?${qs}` : ""}`, operatingCompanyId)
  );
}

export function getJournalEntry(id: string, operatingCompanyId: string) {
  return apiRequest<JournalEntry>(withCompany(`/api/v1/accounting/journal-entries/${id}`, operatingCompanyId));
}

export function createJournalEntry(
  operatingCompanyId: string,
  payload: {
    entry_date: string;
    memo?: string;
    source?: JournalEntrySource;
    postings: Array<{
      account_id: string;
      class_id?: string | null;
      entity_uuid?: string | null;
      debit_or_credit: "debit" | "credit";
      amount_cents: number;
      description?: string | null;
    }>;
  }
) {
  return apiRequest<JournalEntry>(withCompany("/api/v1/accounting/journal-entries", operatingCompanyId), {
    method: "POST",
    body: payload,
  });
}

export function voidJournalEntry(id: string, operatingCompanyId: string, reason: string) {
  return apiRequest<{ ok: true }>(withCompany(`/api/v1/accounting/journal-entries/${id}/void`, operatingCompanyId), {
    method: "POST",
    body: { reason },
  });
}

export function listCoaAccountsForJe() {
  return apiRequest<{ accounts: Array<{ id: string; account_number: string; account_name: string }> }>(
    "/api/v1/catalogs/accounts?status=active&limit=300"
  );
}

export function listClassesForJe() {
  return apiRequest<{ classes: Array<{ id: string; class_name: string; class_code?: string | null }> }>(
    "/api/v1/catalogs/classes?include_inactive=false&limit=300"
  );
}

export type ExpenseCategoryMapKind =
  | "fuel"
  | "maintenance"
  | "driver_pay"
  | "factoring_fee"
  | "toll"
  | "escrow"
  | "insurance"
  | "office"
  | "other";

export type ExpenseCategoryMapPostingSide = "debit" | "credit";

export type ExpenseCategoryMapRow = {
  id: string;
  operating_company_id: string;
  category_kind: ExpenseCategoryMapKind;
  category_code: string;
  account_id: string;
  account_number?: string | null;
  account_name?: string | null;
  posting_side: ExpenseCategoryMapPostingSide;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_user_uuid?: string | null;
  updated_by_user_uuid?: string | null;
};

export const COA_ROLE_VALUES = [
  "ar_control",
  "ap_control",
  "cash_clearing",
  "undeposited_funds",
  "revenue_default",
  "expense_default",
  "factor_reserve_default",
  "escrow_liability_default",
  "sales_tax_payable",
  "cash_basis_adjustment_equity",
  "retained_earnings",
] as const;

export type CoaRole = (typeof COA_ROLE_VALUES)[number];

export type CoaRoleRow = {
  role: CoaRole;
  id: string | null;
  account_id: string | null;
  account_number: string | null;
  account_name: string | null;
  is_active: boolean;
  updated_at: string | null;
};

export function listExpenseCategoryMappings(
  operatingCompanyId: string,
  options: { include_inactive?: boolean; category_kind?: ExpenseCategoryMapKind } = {}
) {
  const query = new URLSearchParams();
  query.set("operating_company_id", operatingCompanyId);
  if (options.include_inactive !== undefined) query.set("include_inactive", String(options.include_inactive));
  if (options.category_kind) query.set("category_kind", options.category_kind);
  return apiRequest<{ rows: ExpenseCategoryMapRow[] }>(`/api/v1/accounting/expense-category-map?${query.toString()}`);
}

export function createExpenseCategoryMapping(
  payload: {
    operating_company_id: string;
    category_kind: ExpenseCategoryMapKind;
    category_code: string;
    account_id: string;
    posting_side: ExpenseCategoryMapPostingSide;
  }
) {
  return apiRequest<ExpenseCategoryMapRow>("/api/v1/accounting/expense-category-map", { method: "POST", body: payload });
}

export function updateExpenseCategoryMapping(
  id: string,
  payload: {
    operating_company_id: string;
    category_kind?: ExpenseCategoryMapKind;
    category_code?: string;
    account_id?: string;
    posting_side?: ExpenseCategoryMapPostingSide;
    is_active?: boolean;
  }
) {
  return apiRequest<ExpenseCategoryMapRow>(`/api/v1/accounting/expense-category-map/${id}`, { method: "PATCH", body: payload });
}

export function deactivateExpenseCategoryMapping(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: true; id: string }>(`/api/v1/accounting/expense-category-map/${id}`, {
    method: "DELETE",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function listCoaRoles(operatingCompanyId: string) {
  return apiRequest<{ rows: CoaRoleRow[] }>(withCompany("/api/v1/accounting/coa-roles", operatingCompanyId));
}

export function upsertCoaRole(
  operatingCompanyId: string,
  body: {
    role: CoaRole;
    account_id: string;
    is_active?: boolean;
  }
) {
  return apiRequest<{ id: string }>(withCompany("/api/v1/accounting/coa-roles", operatingCompanyId), {
    method: "PUT",
    body,
  });
}

export function validateCoaRoles(operatingCompanyId: string) {
  return apiRequest<{
    required_roles: CoaRole[];
    mapped_roles: CoaRole[];
    missing_roles: CoaRole[];
    valid: boolean;
  }>(withCompany("/api/v1/accounting/coa-roles/validate", operatingCompanyId));
}
