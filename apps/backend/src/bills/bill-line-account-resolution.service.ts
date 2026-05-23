import { ExpenseCategoryMapResolutionError, resolveAccountForCategory } from "../accounting/expense-category-map/resolver.service.js";

export type BillLineCategoryInput = {
  description?: string | null;
  line_type?: string | null;
  category_kind?: "maintenance" | null;
  category_code?: string | null;
  line_operating_company_id?: string | null;
};

function normalize(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveMaintenanceCategoryCode(input: BillLineCategoryInput) {
  const explicitCode = normalize(input.category_code);
  if (explicitCode) return explicitCode;

  const text = `${normalize(input.description)} ${normalize(input.line_type)}`;
  if (/\btire|wheel\b/.test(text)) return "tires";
  if (/\bbrake\b/.test(text)) return "brakes";
  if (/\bengine|coolant|transmission|turbo\b/.test(text)) return "engine";
  if (/\bdot\b|\binspection\b/.test(text)) return "dot";
  if (/\bbody\b|collision|paint/.test(text)) return "body";
  if (/\belectrical\b|battery|alternator|wiring/.test(text)) return "electrical";
  if (/\bac\b|\ba\/c\b|air conditioning|hvac/.test(text)) return "ac";
  if (/\bpm\b|preventive|maintenance service/.test(text)) return "pm_preventive";
  return "misc";
}

export async function resolveBillLineAccountId(
  operating_company_id: string,
  input: BillLineCategoryInput
): Promise<{ account_id: string; category_kind: "maintenance"; category_code: string }> {
  const lineCompany = String(input.line_operating_company_id ?? "").trim();
  if (lineCompany && lineCompany !== operating_company_id) {
    throw new Error("bill_line_cross_tenant_refused");
  }

  const category_kind = "maintenance" as const;
  const category_code = deriveMaintenanceCategoryCode(input);
  const resolved = await resolveAccountForCategory(operating_company_id, category_kind, category_code);
  return {
    account_id: resolved.account_id,
    category_kind,
    category_code,
  };
}

export { ExpenseCategoryMapResolutionError };
