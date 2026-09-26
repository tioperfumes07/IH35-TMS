import { describe, expect, it, vi, beforeEach } from "vitest";

// syncLoadStatusToBilling (called internally by syncSettlementLoadsToBilling, same module) opens
// its own connection via withCompanyScope — mock that one seam and drive its query results, rather
// than mocking syncLoadStatusToBilling itself (same-module functions aren't independently mockable
// without module-boundary tricks, and this seam is the real one production code goes through).
const queryMock = vi.fn();
vi.mock("../../accounting/shared.js", () => ({
  withCompanyScope: vi.fn(async (_actorUserId: string, _opco: string, fn: (client: unknown) => unknown) =>
    fn({ query: queryMock })
  ),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => {}) }));
vi.mock("../book-load.service.js", () => ({
  assertClosedLoadHasPricedDriverBill: vi.fn(async () => ({ ok: true })),
}));

import { syncSettlementLoadsToBilling } from "../load-billing-lifecycle.service.js";

const baseInput = { operatingCompanyId: "opco-1", actorUserId: "user-1" };

beforeEach(() => {
  queryMock.mockReset();
});

describe("syncSettlementLoadsToBilling — ROUND 33.2 §1, fired after settlement finalize", () => {
  it("a load with NO invoice (driver side complete, revenue side not) is NOT advanced — stays visible on the billing queue", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ load_status: "delivered", invoice_status: null, factoring_status: "not_factored" }],
    });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-1"] });
    expect(results).toEqual([{ changed: false, reason: "no_invoice" }]);
    // No UPDATE to mdata.loads was ever attempted — the mock only ever received the one SELECT.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("a load with a DRAFT invoice (revenue side not yet real) is NOT advanced", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ load_status: "delivered", invoice_status: "draft", factoring_status: "not_factored" }],
    });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-2"] });
    expect(results).toEqual([{ changed: false, reason: "invoice_not_billable_yet" }]);
  });

  it("a load with an invoice SENT (both sides complete, not yet paid) advances to 'invoiced', never 'closed'", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ load_status: "delivered", invoice_status: "sent", factoring_status: "not_factored" }],
    });
    queryMock.mockResolvedValue({ rows: [{ id: "load-3", status: "invoiced" }] });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-3"] });
    expect(results[0]?.changed).toBe(true);
    expect(results[0]?.to).toBe("invoiced");
  });

  it("a load with an invoice PAID (both sides fully complete) advances all the way to 'closed'", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ load_status: "delivered", invoice_status: "paid", factoring_status: "not_factored" }],
    });
    // R-210: driver side complete — every live driver bill sits in a closed settlement.
    queryMock.mockResolvedValueOnce({ rows: [{ bills: 1, settled: 1 }] });
    // The forward-walk takes multiple UPDATE steps (delivered -> ... -> closed) — any number of
    // them succeed identically for this test; only the FIRST call (the SELECT above) matters for
    // resolving the target.
    queryMock.mockResolvedValue({ rows: [{ id: "load-4", status: "closed" }] });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-4"] });
    expect(results[0]?.changed).toBe(true);
    expect(results[0]?.to).toBe("closed");
  });

  it("processes every load in the settlement, one result per load, in order", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ load_status: "delivered", invoice_status: null, factoring_status: "not_factored" }] })
      .mockResolvedValueOnce({ rows: [{ load_status: "delivered", invoice_status: "sent", factoring_status: "not_factored" }] });
    queryMock.mockResolvedValue({ rows: [{ id: "load-6", status: "invoiced" }] });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-5", "load-6"] });
    expect(results).toHaveLength(2);
    expect(results[0]?.reason).toBe("no_invoice");
    expect(results[1]?.to).toBe("invoiced");
  });

  it("one load's failure never blocks the others, and never throws back to the caller (best-effort, matches syncLoadsForFactoringAdvance's own pattern)", async () => {
    queryMock
      .mockRejectedValueOnce(new Error("transient db error"))
      .mockResolvedValueOnce({ rows: [{ load_status: "delivered", invoice_status: null, factoring_status: "not_factored" }] });
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: ["load-fail", "load-ok"] });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ changed: false, reason: "error" });
    expect(results[1]).toEqual({ changed: false, reason: "no_invoice" });
  });

  it("empty settlement (no loads) is a clean no-op, no query ever runs", async () => {
    const results = await syncSettlementLoadsToBilling({ ...baseInput, loadIds: [] });
    expect(results).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
