import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  order: [] as string[], queue: [] as { label: string; run: () => Promise<void> }[],
  invoice: vi.fn(async () => { h.order.push("invoice"); return { ok: true }; }),
  revenue: vi.fn(async (input: { target_status: string }) => { h.order.push(input.target_status); }),
  factor: vi.fn(async () => { h.order.push("factor"); }),
  billing: vi.fn(async () => { h.order.push("billing"); }),
  pay: vi.fn(async () => { h.order.push("pay"); }),
}));
vi.mock("../../accounting/auto-invoice-on-bol.service.js", () => ({ autoInvoiceOnBol: h.invoice }));
vi.mock("../../accounting/revrec-delivery-posting/poster.service.js", () => ({ postLoadRevenueLatch: h.revenue }));
vi.mock("../../factoring/auto-submit-on-delivery.service.js", () => ({ autoSubmitDeliveredLoadToFactor: h.factor }));
vi.mock("../load-billing-lifecycle.service.js", () => ({ syncLoadStatusToBilling: h.billing }));
vi.mock("../../driver-finance/driver-pay-delivery-accrual.service.js", () => ({ accrueDriverPayAtDeliveryInClientTx: h.pay }));
vi.mock("../../auth/db.js", () => ({ withLuciaBypass: (work: (client: object) => Promise<unknown>) => work({}) }));
vi.mock("../../lib/after-commit.js", () => ({ enqueueAfterCommit: (_client: object, task: { label: string; run: () => Promise<void> }) => { h.queue.push(task); return true; } }));
import { getLoadTransitionHooks } from "../load-transition-hooks.js";

describe("registered delivery latch keeps the existing invoice and after-commit chain", () => {
  it("invoices on the original client, then queues revenue/factor/billing/pay in economic order", async () => {
    const db = { query: vi.fn(async (_sql: string) => ({ rows: [] })) };
    const input = { operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", loadId: "11111111-1111-4111-8111-111111111111", actorUserId: "22222222-2222-4222-8222-222222222222", targetStatus: "delivered_pending_docs", entryDateIso: "2026-10-25" };
    const result = await getLoadTransitionHooks().latchOnDeliveryEvidence(db, input);
    expect(result).toBe("deferred");
    expect(h.invoice).toHaveBeenCalledWith(db, { operatingCompanyId: input.operatingCompanyId, loadId: input.loadId, userId: input.actorUserId });
    expect(db.query.mock.calls.map(call => call[0])).toEqual(["SAVEPOINT delivery_invoice_convert_send", "RELEASE SAVEPOINT delivery_invoice_convert_send"]);
    expect(h.order).toEqual(["invoice"]);
    expect(h.queue.map(task => task.label.split(":")[0])).toEqual(["revrec-latch", "factoring-auto-submit", "load-billing-sync", "driver-pay-accrual"]);
    for (const task of h.queue) await task.run();
    expect(h.order).toEqual(["invoice", "delivered_pending_docs", "completed_docs_received", "factor", "billing", "pay"]);
    expect(h.revenue.mock.calls.every(([input]) => (input as unknown as { entry_date_iso: string }).entry_date_iso === "2026-10-25")).toBe(true);
  });
});
