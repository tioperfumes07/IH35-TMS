/**
 * ACCT-F5626 — validateWoVendorInvoiceTotals must PERSIST the recomputed total_actual_cost, not just
 * validate it against a linked bill/parts-invoice. Both line-item routes (add + delete,
 * work-orders.routes.ts) call this function as their only post-write step; if it only validates,
 * autoCreateBillFromWO/autoCreateExpenseFromWO later post using the stale creation-time total.
 *
 * Fake DB client pattern mirrors wo-edit-posted-bill-guard.test.ts's own convention: match on SQL
 * substrings, no real Postgres — this function's logic branches purely on query result shape, which
 * a fake client can drive deterministically and fast.
 */
import { describe, expect, it } from "vitest";
import { isWoInvoiceMismatch, validateWoVendorInvoiceTotals } from "../wo-cost-validation.js";

const WO = "00000000-0000-0000-0000-0000000000bb";

type FakeConfig = {
  lineTotal: number;
  partsCount?: number;
  partsTotal?: number;
  billsExists?: boolean;
  billsCount?: number;
  billsTotal?: number;
};

function fakeClient(cfg: FakeConfig) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query<R = any>(sql: string, values?: unknown[]): Promise<{ rows: R[] }> {
      calls.push({ sql, values });
      if (sql.includes("FROM maintenance.work_order_lines")) {
        return { rows: [{ total: cfg.lineTotal }] as unknown as R[] };
      }
      if (sql.includes("UPDATE maintenance.work_orders")) {
        return { rows: [] as unknown as R[] };
      }
      if (sql.includes("FROM maintenance.parts_invoice_links")) {
        return { rows: [{ cnt: cfg.partsCount ?? 0, total: cfg.partsTotal ?? 0 }] as unknown as R[] };
      }
      if (sql.includes("to_regclass")) {
        return { rows: [{ ok: cfg.billsExists ?? false }] as unknown as R[] };
      }
      if (sql.includes("FROM accounting.bills")) {
        return { rows: [{ cnt: cfg.billsCount ?? 0, total: cfg.billsTotal ?? 0 }] as unknown as R[] };
      }
      return { rows: [] as unknown as R[] };
    },
  };
}

describe("validateWoVendorInvoiceTotals — ACCT-F5626 total_actual_cost recompute", () => {
  it("persists total_actual_cost when NO bill/parts-invoice is linked yet (the most exposed case)", async () => {
    const client = fakeClient({ lineTotal: 450.5, partsCount: 0, billsExists: false });
    await validateWoVendorInvoiceTotals(client, WO);

    const updateCall = client.calls.find((c) => c.sql.includes("UPDATE maintenance.work_orders"));
    expect(updateCall, "expected a total_actual_cost UPDATE").toBeTruthy();
    expect(updateCall?.values).toEqual([WO, 450.5]);
  });

  it("persists total_actual_cost when a linked bill's total MATCHES the line-item sum", async () => {
    const client = fakeClient({
      lineTotal: 1000,
      billsExists: true,
      billsCount: 1,
      billsTotal: 1000,
    });
    await expect(validateWoVendorInvoiceTotals(client, WO)).resolves.toBeUndefined();

    const updateCall = client.calls.find((c) => c.sql.includes("UPDATE maintenance.work_orders"));
    expect(updateCall?.values).toEqual([WO, 1000]);
  });

  it("still throws WO_INVOICE_MISMATCH when a linked bill's total diverges (existing behavior preserved)", async () => {
    const client = fakeClient({
      lineTotal: 800,
      billsExists: true,
      billsCount: 1,
      billsTotal: 500,
    });
    let caught: unknown = null;
    try {
      await validateWoVendorInvoiceTotals(client, WO);
    } catch (err) {
      caught = err;
    }
    expect(isWoInvoiceMismatch(caught)).toBe(true);
  });

  it("the recompute call always uses the exact sum just computed, not a stale/hardcoded value", async () => {
    const client = fakeClient({ lineTotal: 0, partsCount: 0, billsExists: false });
    await validateWoVendorInvoiceTotals(client, WO);
    const updateCall = client.calls.find((c) => c.sql.includes("UPDATE maintenance.work_orders"));
    // A brand-new WO whose lines were all deleted must recompute to ZERO, not silently keep whatever
    // total_actual_cost happened to hold before — this is exactly the delete-line-item exposure.
    expect(updateCall?.values).toEqual([WO, 0]);
  });
});
