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
export const createScentsxCustomer = (companyId: string, input: { name: string; billing_email?: string | null; billing_phone?: string | null }) =>
  apiRequest<{ id: string }>("/api/v1/mdata/customers", { method: "POST", body: { operating_company_id: companyId, legal_name: input.name, billing_email: input.billing_email ?? undefined, billing_phone: input.billing_phone ?? undefined } });
export type ScentsxRegisterLine = {
  posting_id: string; journal_entry_id: string; entry_date: string; memo: string | null; debit_or_credit: "debit" | "credit";
  amount_cents: string; source_transaction_type: string | null; source_transaction_id: string | null;
};
export const getScentsxAccountRegister = (accountId: string) =>
  apiRequest<{ lines: ScentsxRegisterLine[] }>(`/api/v1/scentsx/accounts/${encodeURIComponent(accountId)}/register`);
export type ScentsxBillableLine = { so_line_id: string; line_no: number; description: string; upc: string | null; shipped: number; billed: number; to_bill: number; unit_price_cents: number };
export type ScentsxDocLink = { id: string; invoice_id: string | null; invoice_number: string | null; invoice_total_cents: string | null; invoice_status: string | null; created_at: string };
export const getScentsxSalesOrderBilling = (salesOrderId: string) =>
  apiRequest<{ lines: ScentsxBillableLine[]; invoices: ScentsxDocLink[] }>(`/api/v1/scentsx/sales-orders/${encodeURIComponent(salesOrderId)}/billing`);
export const invoiceScentsxSalesOrder = (salesOrderId: string, channel: "wholesale" | "retail" | "export") =>
  apiRequest<{ invoice: { invoice_id: string; display_id: string; lines: number; units: number } }>(`/api/v1/scentsx/sales-orders/${encodeURIComponent(salesOrderId)}/invoice`, { method: "POST", body: { channel } });
