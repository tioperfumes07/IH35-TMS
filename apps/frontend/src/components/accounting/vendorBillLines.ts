import type { TwoSectionLine } from "../forms/TwoSectionLineEditor";

/** Line payload persisted to accounting.bill_lines (LAW-E2E #3167 — not memo-only). */
export type VendorBillFormLinePayload = {
  account_id?: string;
  amount_cents: number;
  description?: string;
  section: "A" | "B";
  expense_category_uuid?: string;
  service_item_uuid?: string;
};

/**
 * Flatten TwoSectionLine editor rows into API line payloads.
 * Section A: CoA picker → account_id (expense_category_uuid).
 * Section B: item + optional part/labor sub-rows; account left unset (poster uncategorized tier) —
 * never invent a GL account id.
 */
export function buildVendorBillLinePayloads(lines: TwoSectionLine[]): VendorBillFormLinePayload[] {
  const out: VendorBillFormLinePayload[] = [];
  for (const line of lines) {
    if (line.section === "A") {
      const cents = Math.round(Number(line.amount || 0) * 100);
      if (cents <= 0) continue;
      const accountId = String(line.expense_category_uuid ?? "").trim();
      out.push({
        section: "A",
        amount_cents: cents,
        description: line.description?.trim() || undefined,
        ...(accountId
          ? { account_id: accountId, expense_category_uuid: accountId }
          : {}),
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
