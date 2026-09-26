import { describe, expect, it, vi } from "vitest";

// R-205 — syncLoadStatusToBillingInClientTx runs on the CALLER's client (the Faro CSV import's own
// transaction). It must reach the same decision as the scoped wrapper without opening a connection.
vi.mock("../../accounting/shared.js", () => ({
  withCompanyScope: vi.fn(async () => {
    throw new Error("InClientTx must never open its own scoped connection");
  }),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => {}) }));
vi.mock("../book-load.service.js", () => ({
  assertClosedLoadHasPricedDriverBill: vi.fn(async () => ({ ok: true })),
}));

import { syncLoadStatusToBillingInClientTx } from "../load-billing-lifecycle.service.js";

const input = { operatingCompanyId: "opco-1", loadId: "load-1", actorUserId: "user-1" };

describe("syncLoadStatusToBillingInClientTx (R-205)", () => {
  it("closes an invoiced load whose invoice the factor has funded (advanced), on the given client", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ load_status: "invoiced", invoice_status: "sent", factoring_status: "advanced" }] })
      .mockResolvedValueOnce({ rows: [{ bills: 1, settled: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "load-1" }] });
    const result = await syncLoadStatusToBillingInClientTx({ query }, input);
    expect(result).toEqual({ changed: true, from: "invoiced", to: "closed" });
    expect(String(query.mock.calls[2][0])).toMatch(/UPDATE mdata\.loads/);
    expect(query.mock.calls[2][1]).toEqual(["load-1", "closed", "opco-1", "invoiced"]);
  });

  it("walks completed_docs_received -> invoiced -> closed for a funded invoice", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ load_status: "completed_docs_received", invoice_status: "sent", factoring_status: "advanced" }] })
      .mockResolvedValueOnce({ rows: [{ bills: 2, settled: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: "load-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "load-1" }] });
    const result = await syncLoadStatusToBillingInClientTx({ query }, input);
    expect(result).toEqual({ changed: true, from: "completed_docs_received", to: "closed" });
  });

  it("R-210: a FUNDED load whose driver settlement is still open stops at invoiced (stays on the board)", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ load_status: "completed_docs_received", invoice_status: "sent", factoring_status: "advanced" }] })
      .mockResolvedValueOnce({ rows: [{ bills: 1, settled: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "load-1" }] });
    const result = await syncLoadStatusToBillingInClientTx({ query }, input);
    expect(result).toEqual({ changed: true, from: "completed_docs_received", to: "invoiced" });
  });

  it("R-210: a funded load with NO driver bill never closes", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ load_status: "invoiced", invoice_status: "sent", factoring_status: "advanced" }] })
      .mockResolvedValueOnce({ rows: [{ bills: 0, settled: 0 }] });
    const result = await syncLoadStatusToBillingInClientTx({ query }, input);
    expect(result).toEqual({ changed: false, reason: "already_at_or_past_target" });
  });

  it("leaves a sent, unfunded invoice's load at invoiced", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ load_status: "invoiced", invoice_status: "sent", factoring_status: "not_factored" }] });
    const result = await syncLoadStatusToBillingInClientTx({ query }, input);
    expect(result).toEqual({ changed: false, reason: "already_at_or_past_target" });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
