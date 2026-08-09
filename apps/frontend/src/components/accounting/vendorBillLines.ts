import type { TwoSectionLine } from "../forms/TwoSectionLineEditor";

/** Line payload persisted to accounting.bill_lines (LAW-E2E #3167 — not memo-only). */
export type VendorBillFormLinePayload = {
  account_id?: string;
  amount_cents: number;
  description?: string;
  section: "A" | "B";
  expense_category_uuid?: string;
  category_kind?: string;
  category_code?: string;
  service_item_uuid?: string;
};

/**
 * Map catalogs.expense_categories.code → expense_category_account_map keys.
 * Only codes with a real Neon map entry are translated. Unknown codes keep
 * expense_category_uuid only (poster → uncategorized) — never invent a GL account.
 */
export function mapExpenseCatalogCodeToBillCategory(
  catalogCode: string | undefined
): { category_kind: string; category_code: string } | null {
  const code = String(catalogCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "FUEL") return { category_kind: "fuel", category_code: "fuel" };
  if (code === "REPAIR") return { category_kind: "maintenance", category_code: "maintenance" };
  // ECON-012 / CLS-ECON-EMPTY — PERMIT is a live catalogs.expense_categories code with a
  // real expense_category_account_map row (kind/code = permit). Without this translation the
  // bill line kept expense_category_uuid only and the poster fell through to uncategorized.
  if (code === "PERMIT") return { category_kind: "permit", category_code: "permit" };
  return null;
}

/**
 * Flatten TwoSectionLine editor rows into API line payloads.
 * Section A (WAVE-H1): catalogs.expense_categories id → expense_category_uuid;
 * known codes also set category_kind/code for the B1 map. Never stamp a CoA account
 * id into expense_category_uuid (same-entity FK).
 * Section B: item + optional part/labor sub-rows; account left unset.
 */
export function buildVendorBillLinePayloads(lines: TwoSectionLine[]): VendorBillFormLinePayload[] {
  const out: VendorBillFormLinePayload[] = [];
  for (const line of lines) {
    if (line.section === "A") {
      const cents = Math.round(Number(line.amount || 0) * 100);
      if (cents <= 0) continue;
      const categoryId = String(line.expense_category_uuid ?? "").trim();
      const mapped = mapExpenseCatalogCodeToBillCategory(line.expense_category_code);
      out.push({
        section: "A",
        amount_cents: cents,
        description: line.description?.trim() || undefined,
        ...(categoryId ? { expense_category_uuid: categoryId } : {}),
        ...(mapped ?? {}),
      });
      continue;
    }

    const subRows = line.sub_rows ?? [];
    const subTotal = subRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    if (subRows.length > 0 && subTotal > 0) {
      for (const row of subRows) {
        const cents = Math.round(Number(row.amount || 0) * 100);
        if (cents <= 0) continue;
        out.push({
          section: "B",
          amount_cents: cents,
          description: row.description?.trim() || line.description?.trim() || undefined,
          ...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),
        });
      }
    } else {
      const cents = Math.round(Number(line.amount || 0) * 100);
      if (cents <= 0) continue;
      out.push({
        section: "B",
        amount_cents: cents,
        description: line.description?.trim() || undefined,
        ...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),
      });
    }
  }
  return out;
}
