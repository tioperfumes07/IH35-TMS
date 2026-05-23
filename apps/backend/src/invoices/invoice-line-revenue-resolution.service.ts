import { ExpenseCategoryMapResolutionError, resolveAccountForCategory } from "../accounting/expense-category-map/resolver.service.js";

export type InvoiceLineType =
  | "linehaul"
  | "fsc"
  | "detention"
  | "layover"
  | "lumper"
  | "tonu"
  | "accessorial"
  | "tax"
  | "adjustment"
  | "other";

function normalize(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveRevenueCode(input: { line_type?: string | null; revenue_code?: string | null }) {
  const explicit = normalize(input.revenue_code);
  if (explicit) return explicit;

  const type = normalize(input.line_type) as InvoiceLineType;
  if (type === "linehaul") return "linehaul";
  if (type === "fsc") return "fuel_surcharge";
  if (type === "detention") return "detention";
  if (type === "layover") return "layover";
  if (type === "lumper") return "lumper";
  if (type === "tonu") return "accessorial";
  if (type === "accessorial") return "accessorial";
  if (type === "tax") return "accessorial";
  if (type === "adjustment") return "accessorial";
  return "accessorial";
}

export async function resolveInvoiceLineRevenueAccountId(
  operating_company_id: string,
  input: { line_type?: string | null; revenue_code?: string | null; line_operating_company_id?: string | null }
): Promise<{ account_id: string; revenue_code: string; category_kind: "revenue" }> {
  const lineCompany = String(input.line_operating_company_id ?? "").trim();
  if (lineCompany && lineCompany !== operating_company_id) {
    throw new Error("invoice_line_cross_tenant_refused");
  }

  const revenue_code = deriveRevenueCode(input);
  const resolved = await resolveAccountForCategory(operating_company_id, "revenue", revenue_code);
  return {
    account_id: resolved.account_id,
    revenue_code,
    category_kind: "revenue",
  };
}

export { ExpenseCategoryMapResolutionError };
