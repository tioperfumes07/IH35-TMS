/**
 * Sales tax (accounting/sales-tax routes + ScentsX liability read) — ROUND L.31 M11. Agencies, returns (prepare / file / mark paid with
 * the bill that paid them), and ScentsX's liability for a period (2100 from the books + taxable / exempt sales by month).
 */
import { apiRequest } from "./client";
import type { ScentsxGlLine } from "./scentsx";

export type SalesTaxAgency = { id: string; operating_company_id: string; name: string; jurisdiction: string | null; agency_vendor_id: string | null; created_at: string };
export type SalesTaxReturn = { id: string; agency_id: string; agency_name: string; period_start: string; period_end: string; taxable_sales_cents: number | string;
  non_taxable_sales_cents: number | string; tax_collected_cents: number | string; tax_owed_cents: number | string; status: "open" | "filed" | "paid";
  filed_at: string | null; paid_bill_id: string | null; paid_bill_number: string | null; created_at: string };
export type SalesTaxMonth = { month: string; invoices: number; exempt_invoices: number; taxable_sales_cents: number; exempt_sales_cents: number; tax_cents: number };
export type SalesTaxLiability = {
  operating_company_id: string; from: string; to: string; account: { account_id: string; account_number: string | null; account_name: string };
  liability: { opening_cents: number; collected_cents: number; paid_cents: number; closing_cents: number; lines: ScentsxGlLine[] };
  sales: { months: SalesTaxMonth[]; taxable_sales_cents: number; exempt_sales_cents: number; tax_on_invoices_cents: number };
};
const co = (id: string) => `operating_company_id=${encodeURIComponent(id)}`;

export const getScentsxSalesTaxLiability = (from: string, to: string) =>
  apiRequest<SalesTaxLiability>(`/api/v1/scentsx/sales-tax/liability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const listSalesTaxAgencies = (companyId: string) => apiRequest<{ agencies: SalesTaxAgency[] }>(`/api/v1/accounting/sales-tax/agencies?${co(companyId)}`);
export const createSalesTaxAgency = (companyId: string, b: { name: string; jurisdiction?: string; agency_vendor_id: string }) =>
  apiRequest<{ agency: SalesTaxAgency }>("/api/v1/accounting/sales-tax/agencies", { method: "POST", body: { operating_company_id: companyId, ...b } });
/** The newest 100 returns; `total` = every return on file, so the screen can say when it shows fewer. */
export const listSalesTaxReturns = (companyId: string) => apiRequest<{ returns: SalesTaxReturn[]; total?: number }>(`/api/v1/accounting/sales-tax/returns?${co(companyId)}&limit=100`);
export const prepareSalesTaxReturn = (companyId: string, b: { agency_id: string; period_start: string; period_end: string }) =>
  apiRequest<{ sales_tax_return: SalesTaxReturn }>("/api/v1/accounting/sales-tax/returns/prepare", { method: "POST", body: { operating_company_id: companyId, ...b } });
export const fileSalesTaxReturn = (companyId: string, id: string) =>
  apiRequest<{ sales_tax_return: SalesTaxReturn }>(`/api/v1/accounting/sales-tax/returns/${encodeURIComponent(id)}/file`, { method: "POST", body: { operating_company_id: companyId } });
export const markSalesTaxReturnPaid = (companyId: string, id: string, paidBillId: string) =>
  apiRequest<{ sales_tax_return: SalesTaxReturn }>(`/api/v1/accounting/sales-tax/returns/${encodeURIComponent(id)}/mark-paid`, { method: "POST", body: { operating_company_id: companyId, paid_bill_id: paidBillId } });
