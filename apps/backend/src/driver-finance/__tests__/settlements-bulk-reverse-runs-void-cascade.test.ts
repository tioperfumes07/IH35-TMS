import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.230 (CC-3) — the bulk settlement reverse runs THE ONE settlement void cascade (as POST /settlements/:id/reverse
 * and the Creator Edit do). Fails on the old route: it voided the lines with its own UPDATE and closed the trip, but never
 * released the OPEN driver bills / unpaid reimbursements still pointing at the cancelled settlement.
 */
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../bulk/bulk-update.factory.js", () => ({ appendBulkCrudAudit: vi.fn(), registerBulkRoute: vi.fn() }));
vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  reverseSettlementBillPaymentInClientTx: vi.fn(async () => ({ result: "nothing_to_reverse", run_id: null })),
}));
vi.mock("../../accounting/void.service.js", () => ({ unmatchBankTransactionById: vi.fn(async () => true) }));
vi.mock("../../accounting/cascade-void-engine.service.js", () => ({ cascadeVoidChildren: vi.fn(async () => []) }));
const stamp = vi.fn(async () => ({ changed: true, voidedAt: "2026-10-22T00:00:00Z" }));
vi.mock("../settlement-void-state.service.js", () => ({ stampSettlementVoidedInClientTx: stamp }));
vi.mock("../deductions/settlement-deduction-restore.service.js", () => ({ restoreSettlementDeductionsInClientTx: vi.fn(async () => ({ released: [], retained: [] })) }));

const { handleSettlementBulk } = await import("../settlements-bulk.routes.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const SETL = "22222222-2222-4222-8222-222222222222";

describe("443.230 — bulk settlement reverse runs the one void cascade", () => {
  it("releases the open driver bills and unpaid reimbursements of the reversed settlement, before the dead-state stamp", async () => {
    const order: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM driver_finance.driver_settlements") && sql.includes("FOR UPDATE"))
        return { rows: [{ id: SETL, status: "draft", locked_at: null, paid_via_bank_txn_id: null }] };
      if (sql.includes("UPDATE driver_finance.driver_bills")) order.push("bills");
      if (sql.includes("UPDATE driver_finance.driver_reimbursements")) order.push("reimbursements");
      return { rows: [] };
    });
    stamp.mockImplementation(async () => { order.push("stamp"); return { changed: true, voidedAt: "x" }; });
    const r = await handleSettlementBulk({
      id: SETL, action: "reverse", reason: "bulk reverse for the test", operatingCompanyId: OPCO, actorUserId: "u",
      bulkCallId: "b", client: { query } as never, actorRole: "Owner", payload: {},
    } as never);
    expect(r.ok).toBe(true);
    const bills = query.mock.calls.find(([s]) => String(s).includes("UPDATE driver_finance.driver_bills"));
    expect(bills?.[1]).toEqual([SETL, OPCO]);
    expect(order).toEqual(["bills", "reimbursements", "stamp"]);
  });
});
