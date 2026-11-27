import { apiRequest } from "./client";

/** SCENTSX — ScentsX LLC (TIO Perfumes) as its own company in the accounting engine. Amounts are integer cents. */
export type ScentsxCompany = {
  id: string; code: string; legal_name: string; short_name: string | null; company_type: string; tax_id: string | null;
  accounts: number; roles: number; periods: number; customers_linked: number; vendors_linked: number;
};
export type ScentsxAccount = {
  id: string; account_number: string | null; account_name: string; account_type: string; account_subtype: string | null;
  roles: string[]; debit_cents: string; credit_cents: string;
};
export const getScentsxCompany = () => apiRequest<{ company: ScentsxCompany }>("/api/v1/scentsx/company");
export const listScentsxAccounts = () => apiRequest<{ accounts: ScentsxAccount[] }>("/api/v1/scentsx/accounts");
export type ScentsxSweep = { scanned: number; posted: number; skipped: number; failed: Array<{ id: string; error: string }> };
export const getScentsxPendingMoves = () => apiRequest<{ pending: number }>("/api/v1/scentsx/stock-moves/pending");
export const postScentsxPendingMoves = () => apiRequest<{ result: ScentsxSweep }>("/api/v1/scentsx/stock-moves/post-pending", { method: "POST", body: {} });
export type ScentsxLink = { id: string; desk_id: string; engine_id: string; engine_name: string; created_at: string; voided_at: string | null; void_reason: string | null };
export const listScentsxCustomerLinks = (deskId: string) => apiRequest<{ links: ScentsxLink[] }>(`/api/v1/scentsx/customer-links?desk_id=${encodeURIComponent(deskId)}`);
export const linkScentsxCustomer = (deskId: string, engineId: string) =>
  apiRequest<{ link: { id: string } }>("/api/v1/scentsx/customer-links", { method: "POST", body: { desk_id: deskId, engine_id: engineId } });
/** The canonical customer create (mdata.customers) for ScentsX's company — the same route every customer goes through. */
export const createScentsxCustomer = (companyId: string, input: { name: string; email: string; phone?: string | null }) =>
  apiRequest<{ id: string }>("/api/v1/mdata/customers", { method: "POST", body: { operating_company_id: companyId, legal_name: input.name, email: input.email, phone: input.phone ?? undefined } });
export type ScentsxRegisterLine = {
  posting_id: string; journal_entry_id: string; entry_date: string; memo: string | null; debit_or_credit: "debit" | "credit";
  amount_cents: string; source_transaction_type: string | null; source_transaction_id: string | null;
};
export const getScentsxAccountRegister = (accountId: string) =>
  apiRequest<{ lines: ScentsxRegisterLine[] }>(`/api/v1/scentsx/accounts/${encodeURIComponent(accountId)}/register`);
export type ScentsxBillableLine = { so_line_id: string; line_no: number; description: string; upc: string | null; shipped: number; billed: number; to_bill: number; unit_price_cents: number };
export type ScentsxDocLink = { id: string; invoice_id: string | null; invoice_number: string | null; invoice_total_cents: string | null; invoice_status: string | null; created_at: string };
export type ScentsxExportProof = { id: string; proof_kind: string; document_number: string | null; crossed_on: string | null; port: string | null; file_id: string; created_at: string };
export type ScentsxPartyStatus = { blocked: boolean; reason: "never_screened" | "list_changed" | "possible_match" | "confirmed_match" | null; screening_id: string | null };
export const getScentsxSalesOrderBilling = (salesOrderId: string) =>
  apiRequest<{ lines: ScentsxBillableLine[]; invoices: ScentsxDocLink[]; export_proofs: ScentsxExportProof[]; export_proof_on_file: boolean; resale_certificate_on_file: boolean; sanctions: ScentsxPartyStatus | null }>(`/api/v1/scentsx/sales-orders/${encodeURIComponent(salesOrderId)}/billing`);
export const invoiceScentsxSalesOrder = (salesOrderId: string, channel: "wholesale" | "retail" | "export") =>
  apiRequest<{ invoice: { invoice_id: string; display_id: string; lines: number; units: number } }>(`/api/v1/scentsx/sales-orders/${encodeURIComponent(salesOrderId)}/invoice`, { method: "POST", body: { channel } });
export type ScentsxCredit = {
  contact_company_id: string; customer_id: string | null; account_type: string | null; credit_limit_cents: number | null; terms_days: number | null;
  on_hold: boolean; hold_reason: string | null; open_ar_cents: number; past_due_cents: number; oldest_past_due_days: number | null;
  draft_invoice_cents: number; shipped_not_billed_cents: number; open_order_cents: number; exposure_cents: number; available_cents: number | null; over_limit: boolean;
  kyc_status: ScentsxKycStatus; kyc_missing: string[]; kyc_warnings: string[]; pagare_held_usd_cents: number; pagare_held_mxn_cents: number; pagares_held: number;
};
export const getScentsxCredit = (contactCompanyId: string) =>
  apiRequest<{ credit: ScentsxCredit }>(`/api/v1/scentsx/customers/${encodeURIComponent(contactCompanyId)}/credit`);
// SCENTSX B9 — cash log + Form 8300
export type ScentsxPaymentForm = "currency_usd" | "currency_foreign" | "cashiers_check" | "money_order" | "bank_draft" | "travelers_check" | "personal_check" | "wire" | "card";
export type ScentsxCashPayer = { id: string; payer_kind: "individual" | "business"; legal_name: string; contact_company_id: string | null; customer_id: string | null; identity_complete: boolean };
export type Scentsx8300Case = { id: string; case_no: string; reason: string; status: string; total_cash_cents: string; due_on: string; filed_at: string | null; bsa_confirmation: string | null; payer_statement_sent_on: string | null; payer_id: string; payer_name: string; overdue: boolean };
export type ScentsxCashReceipt = { id: string; receipt_no: string; received_at: string; payment_form: ScentsxPaymentForm; amount_cents: string; counts_as_cash: boolean; voided_at: string | null; void_reason: string | null; payment_id: string | null; invoice_id: string | null; sales_order_id: string | null; case_no: string | null; payer_name: string; payer_id: string };
export type ScentsxStructuringAlert = { id: string; receipt_count: number; window_total_cents: string; created_at: string; reviewed_at: string | null; review_note: string | null; payer_name: string; receipt_no: string };
export type ScentsxUnloggedCash = { id: string; display_id: string | null; payment_date: string; amount_cents: string; customer_id: string | null };
export type ScentsxComplianceDesk = {
  settings: { cash_report_threshold_cents: number; filing_days: number; related_window_hours: number; aggregation_window_days: number; structuring_floor_cents: number; structuring_window_days: number; structuring_min_count: number };
  cases: Scentsx8300Case[]; alerts: ScentsxStructuringAlert[]; receipts: ScentsxCashReceipt[]; unlogged_cash_payments: ScentsxUnloggedCash[]; payers: ScentsxCashPayer[];
};
export type ScentsxPayerInput = {
  payer_kind: "individual" | "business"; legal_name: string; contact_company_id?: string | null; customer_id?: string | null;
  address_line?: string | null; city?: string | null; state_region?: string | null; postal_code?: string | null; country?: string | null;
  date_of_birth?: string | null; occupation?: string | null; tin_kind?: "ssn" | "itin" | "ein" | "foreign_none" | null; tin_last4?: string | null;
  id_type?: "drivers_license" | "passport" | "alien_registration" | "ine_mexico" | "other_government" | null; id_issuer?: string | null;
  id_number_last4?: string | null; id_copy_file_id?: string | null;
};
export type ScentsxReceiptInput = {
  payer_id: string; received_at: string; payment_form: ScentsxPaymentForm; amount_cents: number; payment_id?: string | null; invoice_id?: string | null;
  sales_order_id?: string | null; foreign_currency_code?: string | null; instrument_issuer?: string | null; instrument_serial?: string | null;
  consumer_durable_retail?: boolean; known_avoidance?: boolean; notes?: string | null;
};
export type ScentsxReceiptResult = { receipt_id: string; receipt_no: string; counts_as_cash: boolean; related_unreported_cents: number; case: { id: string; case_no: string; due_on: string; total_cash_cents: number } | null; structuring_alert_id: string | null };
export const getScentsxCompliance = () => apiRequest<ScentsxComplianceDesk>("/api/v1/scentsx/compliance");
export const createScentsxCashPayer = (input: ScentsxPayerInput) =>
  apiRequest<{ payer: { id: string; identity_complete: boolean; missing: string[] } }>("/api/v1/scentsx/compliance/payers", { method: "POST", body: input });
export const updateScentsxCashPayer = (id: string, input: Partial<ScentsxPayerInput>) =>
  apiRequest<{ payer: { id: string; identity_complete: boolean; missing: string[] } }>(`/api/v1/scentsx/compliance/payers/${encodeURIComponent(id)}`, { method: "PATCH", body: input });
export const recordScentsxCashReceipt = (input: ScentsxReceiptInput) =>
  apiRequest<{ receipt: ScentsxReceiptResult }>("/api/v1/scentsx/compliance/receipts", { method: "POST", body: input });
export const voidScentsxCashReceipt = (id: string, reason: string) =>
  apiRequest<{ voided: boolean }>(`/api/v1/scentsx/compliance/receipts/${encodeURIComponent(id)}/void`, { method: "POST", body: { reason } });
export const markScentsxReceiptSuspicious = (id: string, reason: string) =>
  apiRequest<{ case: { id: string; case_no: string; due_on: string } }>(`/api/v1/scentsx/compliance/receipts/${encodeURIComponent(id)}/suspicious`, { method: "POST", body: { reason } });
export const markScentsx8300Filed = (id: string, bsa_confirmation: string, filed_copy_file_id?: string | null) =>
  apiRequest<{ filed: boolean }>(`/api/v1/scentsx/compliance/cases/${encodeURIComponent(id)}/filed`, { method: "POST", body: { bsa_confirmation, filed_copy_file_id } });
export const markScentsx8300StatementSent = (id: string, sent_on: string) =>
  apiRequest<{ ok: boolean }>(`/api/v1/scentsx/compliance/cases/${encodeURIComponent(id)}/statement-sent`, { method: "POST", body: { sent_on } });
export const reviewScentsxStructuringAlert = (id: string, note: string) =>
  apiRequest<{ ok: boolean }>(`/api/v1/scentsx/compliance/alerts/${encodeURIComponent(id)}/review`, { method: "POST", body: { note } });
// SCENTSX B9b — OFAC screening, resale certificates, export proof
export type ScentsxSanctionsHit = { ent_num: number; name: string; program: string | null; sdn_type: string | null; score: number };
export type ScentsxScreening = { id: string; party_kind: string; screened_name: string; best_score: number; hits?: ScentsxSanctionsHit[]; result?: string; created_at: string; cleared_at?: string | null; clear_reason?: string | null; confirmed_match_at?: string | null };
export type ScentsxSanctionsDesk = { list: { id: string; source_url: string; published_on: string | null; sdn_rows: number; alt_rows: number; loaded_at: string } | null; open_matches: ScentsxScreening[]; recent: ScentsxScreening[] };
export const getScentsxSanctions = () => apiRequest<ScentsxSanctionsDesk>("/api/v1/scentsx/compliance/sanctions");
export const loadScentsxSanctionsList = () =>
  apiRequest<{ load: { load_id: string; new_load: boolean; names: number }; rescreen: { screened: number; possible_matches: number } }>("/api/v1/scentsx/compliance/sanctions/load", { method: "POST", body: {} });
export const clearScentsxScreening = (id: string, reason: string) => apiRequest<{ cleared: boolean }>(`/api/v1/scentsx/compliance/sanctions/${encodeURIComponent(id)}/clear`, { method: "POST", body: { reason } });
export const confirmScentsxMatch = (id: string) => apiRequest<{ confirmed: boolean }>(`/api/v1/scentsx/compliance/sanctions/${encodeURIComponent(id)}/confirm`, { method: "POST", body: {} });
export const addScentsxExportProof = (input: { sales_order_id: string; proof_kind: "broker_export_certification" | "foreign_import_papers" | "bill_of_lading_outside_us"; document_number?: string | null; crossed_on?: string | null; port?: string | null; file_id: string }) =>
  apiRequest<{ proof: { id: string } }>("/api/v1/scentsx/compliance/export-proofs", { method: "POST", body: input });
export const addScentsxResaleCertificate = (input: { contact_company_id: string; customer_id?: string | null; form_code?: "01-339" | "out_of_state" | "mexico_export_buyer"; purchaser_tax_number?: string | null; signed_on: string; file_id: string }) =>
  apiRequest<{ certificate: { id: string } }>("/api/v1/scentsx/compliance/resale-certificates", { method: "POST", body: input });
export const screenScentsxParty = (kind: "contact_company" | "customer" | "vendor" | "cash_payer", id: string) =>
  apiRequest<{ screening: { screening_id: string; result: string; best_score: number; hits: number } }>("/api/v1/scentsx/compliance/sanctions/screen", { method: "POST", body: { kind, id } });
export const getScentsxCustomerCompliance = (contactCompanyId: string) =>
  apiRequest<{ resale_certificate_on_file: boolean; sanctions: ScentsxPartyStatus | null; customer_id: string | null }>(`/api/v1/scentsx/customers/${encodeURIComponent(contactCompanyId)}/compliance`);
export type ScentsxTieOut = { as_of: string; account_id: string | null; subledger_cents: number; gl_cents: number; waiting_cents: number; waiting_moves: number; difference_cents: number; ties: boolean; zero_cost_moves: number };
export const getScentsxInventoryTieOut = () => apiRequest<{ tie_out: ScentsxTieOut }>("/api/v1/scentsx/inventory/tie-out");

// SCENTSX B12 — KYC profile, W-9 / W-8, pagarés
export type ScentsxKycStatus = "none" | "incomplete" | "complete";
export type ScentsxKycKind = "customer" | "vendor";
export type ScentsxKycProfile = {
  id: string; contact_company_id: string | null; perfume_vendor_id: string | null; residency: "us" | "mexico" | "other"; entity_kind: "individual" | "business";
  legal_name: string; dba_name: string | null; ein: string | null; ssn_itin_last4: string | null; sales_tax_permit_state: string | null; sales_tax_permit_number: string | null;
  sales_tax_permit_file_id: string | null; rfc: string | null; curp: string | null; regimen_fiscal: string | null; constancia_fiscal_file_id: string | null; ine_file_id: string | null;
  passport_number: string | null; passport_country: string | null; passport_expires_on: string | null; passport_file_id: string | null;
  visa_kind: "b1_b2" | "border_crossing_card" | "other" | null; visa_number: string | null; visa_expires_on: string | null; visa_file_id: string | null;
  contact_person: string | null; phone: string | null; email: string | null; address_line: string | null; city: string | null; state_region: string | null;
  postal_code: string | null; country: string | null; proof_of_address_file_id: string | null; notes: string | null; reviewed_at: string | null;
};
export type ScentsxTaxForm = { id: string; form_kind: "W-9" | "W-8BEN" | "W-8BEN-E" | "W-8ECI"; signed_on: string; expires_on: string | null; file_id: string; voided_at: string | null };
export type ScentsxPagare = { id: string; pagare_no: string; amount_cents: number; currency: "USD" | "MXN"; issued_on: string; due_on: string | null; status: string; suscriptor_name: string; aval_name: string | null; place_of_payment: string; signed_file_id: string };
export type ScentsxPartyKyc = { profile: ScentsxKycProfile | null; tax_forms: ScentsxTaxForm[]; pagares: ScentsxPagare[]; status: ScentsxKycStatus; missing: string[]; warnings: string[]; engine_id: string | null };
export type ScentsxKycDesk = {
  parties: Array<{ kind: ScentsxKycKind; party_id: string; name: string; engine_id: string; reviewed_at: string | null; status: ScentsxKycStatus; missing: string[]; warnings: string[] }>;
  counts: { complete: number; incomplete: number; none: number; expiring: number };
  pagares_held: Array<{ id: string; pagare_no: string; contact_company_id: string; customer_name: string; amount_cents: number; currency: string; issued_on: string; due_on: string | null }>;
};
const kycPath = (kind: ScentsxKycKind, id: string) => `/api/v1/scentsx/compliance/kyc/${kind}/${encodeURIComponent(id)}`;
export const getScentsxKycDesk = () => apiRequest<ScentsxKycDesk>("/api/v1/scentsx/compliance/kyc");
export const getScentsxPartyKyc = (kind: ScentsxKycKind, id: string) => apiRequest<ScentsxPartyKyc>(kycPath(kind, id));
export const saveScentsxPartyKyc = (kind: ScentsxKycKind, id: string, body: Partial<ScentsxKycProfile>) =>
  apiRequest<ScentsxPartyKyc>(kycPath(kind, id), { method: "PUT", body });
export const markScentsxKycReviewed = (kind: ScentsxKycKind, id: string) => apiRequest<ScentsxPartyKyc>(`${kycPath(kind, id)}/reviewed`, { method: "POST", body: {} });
export const addScentsxTaxForm = (kind: ScentsxKycKind, id: string, body: { form_kind: ScentsxTaxForm["form_kind"]; signed_on: string; file_id: string; expires_on?: string | null }) =>
  apiRequest<ScentsxPartyKyc>(`${kycPath(kind, id)}/tax-forms`, { method: "POST", body });
export const voidScentsxTaxForm = (formId: string, reason: string) =>
  apiRequest<{ voided: boolean }>(`/api/v1/scentsx/compliance/tax-forms/${encodeURIComponent(formId)}/void`, { method: "POST", body: { reason } });
export const addScentsxPagare = (body: { contact_company_id: string; amount_cents: number; currency: "USD" | "MXN"; issued_on: string; due_on?: string | null; place_of_payment: string; suscriptor_name: string; aval_name?: string | null; moratorio_rate_pct?: number | null; signed_file_id: string }) =>
  apiRequest<{ id: string; pagare_no: string }>("/api/v1/scentsx/compliance/pagares", { method: "POST", body });
export const closeScentsxPagare = (id: string, action: "return" | "void", note: string) =>
  apiRequest<{ id: string; status: string }>(`/api/v1/scentsx/compliance/pagares/${encodeURIComponent(id)}/${action}`, { method: "POST", body: { note } });

// SCENTSX B13 — Sales by Customer / Sales by Item (issued invoices, income lines)
export type ScentsxSalesRow = { key: string; name: string; last_sale_date: string | null; invoices: number; units: number; sales_cents: number; cost_cents: number | null; margin_cents: number | null; pct_of_sales: number };
export type ScentsxSalesReport = { from: string; to: string; by: "customer" | "item"; rows: ScentsxSalesRow[]; total: { invoices: number; units: number; sales_cents: number; cost_cents: number | null; margin_cents: number | null } };
export const getScentsxSalesReport = (by: "customer" | "item", from: string, to: string) =>
  apiRequest<{ report: ScentsxSalesReport }>(`/api/v1/scentsx/reports/sales?by=${by}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

// SCENTSX B13 — a TIO Perfumes vendor becomes ScentsX's vendor (A/P): canonical vendor create + scentsx.vendor_links
export const listScentsxVendorLinks = (deskId: string) => apiRequest<{ links: ScentsxLink[] }>(`/api/v1/scentsx/vendor-links?desk_id=${encodeURIComponent(deskId)}`);
export const linkScentsxVendor = (deskId: string, engineId: string) =>
  apiRequest<{ link: { id: string }; screening: { result: string } | null }>("/api/v1/scentsx/vendor-links", { method: "POST", body: { desk_id: deskId, engine_id: engineId } });
/** The canonical vendor create (mdata.vendors) for ScentsX's company — the same route every vendor goes through. */
export const createScentsxVendor = (companyId: string, name: string) =>
  apiRequest<{ id?: string; vendor?: { id: string } }>("/api/v1/mdata/vendors", { method: "POST", body: { operating_company_id: companyId, name, vendor_type: "Perfume supplier" } });
