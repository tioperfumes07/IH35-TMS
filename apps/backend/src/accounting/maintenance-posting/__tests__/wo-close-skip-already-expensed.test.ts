/**
 * MAINT-F5697-CLASS regression — a WO created with payment_timing='paid_same_day' already routes
 * through autoCreateExpenseFromWO (two-section-service.ts), which stamps linked_work_order_uuid on
 * a real accounting.expenses row for the WO's cost. WO-close used to run unconditionally regardless,
 * creating a SECOND, redundant accounting.bills row for the identical total_actual_cost with
 * status='unpaid' — a real A/P liability to a vendor who was already paid in cash at creation time.
 *
 * getOrCreateBillForWorkOrder must check for an already-real accounting.expenses row linked to this
 * WO (mirrors its own existing accounting.bills reuse check) and skip bill creation entirely when
 * one exists — never reaching insertBillLinesFromWorkOrder / recalcBillTotal / the QBO push enqueue.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: any) => Promise<any>) => fn(mockClientRef.client)),
}));
vi.mock("../../../lib/feature-flags/service.js", () => ({
  isEnabled: vi.fn(async () => false),
}));
vi.mock("../../../qbo/tms-bill-push-chain.service.js", () => ({
  enqueueTmsBillPushRequested: vi.fn(async () => undefined),
}));
vi.mock("../../posting-engine.service.js", () => ({
  PostingEngineError: class PostingEngineError extends Error {},
  postSourceTransaction: vi.fn(),
}));
vi.mock("../../bills.service.js", () => ({
  resolveMdataVendorIdBestEffort: vi.fn(async () => null),
  resolveVendorIsSampleDataBestEffort: vi.fn(async () => false),
}));
vi.mock("../../expense-category-map/resolver.service.js", () => ({
  ExpenseCategoryMapResolutionError: class ExpenseCategoryMapResolutionError extends Error {},
  resolveAccountForCategory: vi.fn(),
}));

import { processMaintenanceWorkOrderClose } from "../poster.service.js";
import { enqueueTmsBillPushRequested } from "../../../qbo/tms-bill-push-chain.service.js";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const WO_ID = "wo-paid-same-day-1";

// Mutable ref so the hoisted withLuciaBypass mock (defined before this module's own scope exists)
// can reach whichever client the current test builds.
const mockClientRef: { client: any } = { client: null };

function makeClient(opts: { hasExistingExpense: boolean }) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("FROM maintenance.work_orders")) {
      return {
        rows: [
          {
            id: WO_ID,
            status: "closed",
            vendor_id: "vendor-1",
            external_vendor_id: null,
            unit_id: "unit-1",
            total_actual_cost: "150.00",
            display_id: "WO-USMCA-REPAIR-08-21-2026-0001-V5",
          },
        ],
      };
    }
    if (sql.includes("FROM accounting.expenses")) {
      return { rows: opts.hasExistingExpense ? [{ id: "exp-already-real" }] : [] };
    }
    if (sql.includes("FROM accounting.bills")) {
      // Existing-bill reuse check — must never be reached when already-expensed short-circuits first.
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO accounting.bills")) {
      return { rows: [{ id: "bill-should-not-exist" }] };
    }
    return { rows: [] };
  });
  return { client: { query } as never, calls };
}

describe("processMaintenanceWorkOrderClose — skip bill creation when already expensed (MAINT-F5697-CLASS)", () => {
  it("skips bill creation entirely when the WO already has a real linked accounting.expenses row", async () => {
    const { client, calls } = makeClient({ hasExistingExpense: true });
    mockClientRef.client = client;

    const result = await processMaintenanceWorkOrderClose({
      operating_company_id: OCI,
      work_order_id: WO_ID,
      actor_user_id: "user-1",
    });

    expect(result.bill_id).toBeNull();
    expect(result.bill_action).toBe("skipped_already_expensed");
    expect(calls.some((c) => c.sql.includes("INSERT INTO accounting.bills"))).toBe(false);
    expect(enqueueTmsBillPushRequested).not.toHaveBeenCalled();
  });

  it("still creates a bill normally when no expense is already linked to the WO", async () => {
    const { client } = makeClient({ hasExistingExpense: false });
    mockClientRef.client = client;

    const result = await processMaintenanceWorkOrderClose({
      operating_company_id: OCI,
      work_order_id: WO_ID,
      actor_user_id: "user-1",
    });

    expect(result.bill_action).not.toBe("skipped_already_expensed");
    expect(result.bill_id).toBe("bill-should-not-exist");
  });
});
