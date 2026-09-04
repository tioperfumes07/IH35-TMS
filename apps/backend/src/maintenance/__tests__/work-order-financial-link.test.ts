import { describe, expect, it, vi } from "vitest";
import { assertWorkOrderCostFinancialLink } from "../work-order-financial-link.js";

function client(context: { unit_id: string | null; vendor_id: string | null; load_id: string | null; cost_cents: number }, linked: Array<{ kind: "bill" | "expense"; id: string }> = []) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM maintenance.work_orders wo")) return { rows: [context] };
    if (sql.includes("FROM accounting.bills b")) return { rows: linked };
    throw new Error(`unexpected query: ${sql}`);
  });
  return { query };
}

describe("FLT-06 work-order close financial linkage", () => {
  it("permits a zero-cost work order without inventing a financial document", async () => {
    const db = client({ unit_id: null, vendor_id: null, load_id: null, cost_cents: 0 });
    await expect(assertWorkOrderCostFinancialLink(db, "company", "wo")).resolves.toEqual({
      ok: true,
      cost_cents: 0,
      financial_kind: null,
      financial_id: null,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ unit_id: null, vendor_id: "vendor", load_id: "load", cost_cents: 100 }, "unit_required"],
    [{ unit_id: "unit", vendor_id: null, load_id: "load", cost_cents: 100 }, "vendor_required"],
  ] as const)("fails closed when a positive-cost repair lacks canonical linkage", async (context, reason) => {
    const db = client(context);
    await expect(assertWorkOrderCostFinancialLink(db, "company", "wo")).resolves.toMatchObject({ ok: false, reason });
  });

  it("rejects a positive-cost work order with no linked bill or expense", async () => {
    const db = client({ unit_id: "unit", vendor_id: "vendor", load_id: "load", cost_cents: 25000 });
    await expect(assertWorkOrderCostFinancialLink(db, "company", "wo")).resolves.toEqual({
      ok: false,
      cost_cents: 25000,
      reason: "financial_document_required",
    });
  });

  it("accepts a financial document linked to the exact work order, company, unit and vendor", async () => {
    const db = client(
      { unit_id: "unit", vendor_id: "vendor", load_id: "load", cost_cents: 25000 },
      [{ kind: "bill", id: "bill" }]
    );
    await expect(assertWorkOrderCostFinancialLink(db, "company", "wo")).resolves.toEqual({
      ok: true,
      cost_cents: 25000,
      financial_kind: "bill",
      financial_id: "bill",
    });
    const financialQuery = String(db.query.mock.calls[1]?.[0] ?? "");
    expect(financialQuery).toContain("linked_work_order_uuid = $2::uuid");
    expect(financialQuery).toContain("linked.unit_id = $3::text");
    expect(financialQuery).toContain("linked.vendor_id = $4::text");
    expect(financialQuery).toContain("linked.load_id IS NOT DISTINCT FROM $5::text");
    expect(db.query.mock.calls[1]?.[1]).toEqual(["company", "wo", "unit", "vendor", "load"]);
  });
});
