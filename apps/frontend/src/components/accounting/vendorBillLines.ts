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
  // GO-18 (owner correction 2026-09-02, N1 gap) — real FK to mdata.loads via accounting.bill_lines.
  // Backend (bills.routes.ts createBillLineSchema, bills.service.ts createVendorBill INSERT) has
  // accepted this since #19459; the frontend simply never sent it. Not memo-only (LAW-E2E #3167).
  load_id?: string;
  /**
   * Round 92/94 (item lines remainder, migration 202614271200) — catalogs.items FK + qty x rate =
   * amount. All four travel together or not at all (bills.service.ts enforces this server-side).
   */
  item_id?: string;
  quantity?: number;
  rate_cents?: number;
  unit_of_measure?: string;
};

/** Bill lines carry no per-unit signal today (no catalogs.items.unit_of_measure column) — "each"
 *  is the QuickBooks-standard default for a picked item with no more specific unit, same as an
 *  unmeasured Product/Service line there. Only ever written alongside a real item_id + quantity;
 *  never invented for a line with no item selected. */
const DEFAULT_UNIT_OF_MEASURE = "each";

export type ExpenseCategoryMapMeta = {
  category_kind?: string;
  category_code?: string;
};

/**
 * Map catalogs.expense_categories.code (+ optional metadata) → expense_category_account_map keys.
 * Prefer metadata written by ECON-012 seed (exact kind/code). Legacy aliases kept for FUEL/REPAIR/PERMIT.
 * Never invent a GL account — unknown codes return null (poster → uncategorized).
 */
export function mapExpenseCatalogCodeToBillCategory(
  catalogCode: string | undefined,
  meta?: ExpenseCategoryMapMeta | null
): { category_kind: string; category_code: string } | null {
  const metaKind = String(meta?.category_kind ?? "")
    .trim()
    .toLowerCase();
  const metaCode = String(meta?.category_code ?? "")
    .trim()
    .toLowerCase();
  if (metaKind && metaCode) {
    return { category_kind: metaKind, category_code: metaCode };
  }

  const code = String(catalogCode ?? "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  if (code === "FUEL") return { category_kind: "fuel", category_code: "fuel" };
  if (code === "REPAIR") return { category_kind: "maintenance", category_code: "maintenance" };
  // ECON-012 / CLS-ECON-EMPTY — PERMIT is a live catalogs.expense_categories code with a
  // real expense_category_account_map row (kind/code = permit).
  if (code === "PERMIT") return { category_kind: "permit", category_code: "permit" };

  // Seeded ECON-012 rows use UPPER(category_code) when no legacy alias applies.
  const lower = code.toLowerCase();
  if (/^[a-z][a-z0-9_]*$/.test(lower)) {
    return { category_kind: lower, category_code: lower };
  }
  return null;
}

/**
 * Round 92/94 (item lines remainder) — the Section B item-line row already carries real
 * quantity/unit_cost the moment an operator picks a catalogs.items entry and types a quantity
 * (CostBreakdownBox's own live amount = quantity * unit_cost computation). Deriving amount_cents
 * FROM quantity * rate_cents here (rather than trusting the UI's separately-rounded `amount`
 * field) guarantees the DB's own CHECK — round(quantity * rate_cents) = round(amount * 100) —
 * holds exactly, by construction, not by coincidence. Returns null when there is no item picked
 * or no positive quantity: the line stays amount-only, exactly today's behavior.
 */
function deriveItemQtyRate(
  serviceItemUuid: string | undefined,
  quantity: number | undefined,
  unitCost: number | undefined
): { item_id: string; quantity: number; rate_cents: number; unit_of_measure: string; amount_cents: number } | null {
  const itemId = String(serviceItemUuid ?? "").trim();
  const qty = Number(quantity ?? 0);
  if (!itemId || !(qty > 0)) return null;
  const rateCents = Number(unitCost ?? 0) * 100;
  const amountCents = Math.round(qty * rateCents);
  if (amountCents <= 0) return null;
  return { item_id: itemId, quantity: qty, rate_cents: rateCents, unit_of_measure: DEFAULT_UNIT_OF_MEASURE, amount_cents: amountCents };
}

/**
 * Flatten TwoSectionLine editor rows into API line payloads.
 * Section A (WAVE-H1): catalogs.expense_categories id → expense_category_uuid;
 * known codes also set category_kind/code for the B1 map. Never stamp a CoA account
 * id into expense_category_uuid (same-entity FK).
 * Section B: item + optional part/labor sub-rows; account left unset. A sub-row breakdown
 * (parts/labor) FKs to catalogs.parts/labor_rates, not catalogs.items — never sent as
 * item_id/quantity/rate_cents (a different FK target the DB would reject).
 */
export function buildVendorBillLinePayloads(
  lines: TwoSectionLine[],
  // GO-18 (owner correction 2026-09-02) — when this bill was opened from a load's own "+ Add Bill"
  // entry point, stamp the real FK onto every line. Optional and additive: omitting it reproduces
  // the exact prior behavior (no load_id) for every other bill-create caller (WO/claim/unit/etc).
  defaultLoadId?: string
): VendorBillFormLinePayload[] {
  const out: VendorBillFormLinePayload[] = [];
  for (const line of lines) {
    if (line.section === "A") {
      const cents = Math.round(Number(line.amount || 0) * 100);
      if (cents <= 0) continue;
      const categoryId = String(line.expense_category_uuid ?? "").trim();
      const mapped = mapExpenseCatalogCodeToBillCategory(line.expense_category_code, {
        category_kind: line.expense_category_kind,
        category_code: line.expense_category_map_code,
      });
      out.push({
        section: "A",
        amount_cents: cents,
        description: line.description?.trim() || undefined,
        ...(categoryId ? { expense_category_uuid: categoryId } : {}),
        ...(mapped ?? {}),
        ...(defaultLoadId ? { load_id: defaultLoadId } : {}),
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
          ...(defaultLoadId ? { load_id: defaultLoadId } : {}),
        });
      }
    } else {
      const derived = deriveItemQtyRate(line.service_item_uuid, line.quantity, line.unit_cost);
      const cents = derived?.amount_cents ?? Math.round(Number(line.amount || 0) * 100);
      if (cents <= 0) continue;
      out.push({
        section: "B",
        amount_cents: cents,
        description: line.description?.trim() || undefined,
        ...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),
        ...(defaultLoadId ? { load_id: defaultLoadId } : {}),
        ...(derived
          ? { item_id: derived.item_id, quantity: derived.quantity, rate_cents: derived.rate_cents, unit_of_measure: derived.unit_of_measure }
          : {}),
      });
    }
  }
  return out;
}
