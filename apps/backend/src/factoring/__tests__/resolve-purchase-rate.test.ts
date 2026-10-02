// Lead ROUND 297 — one purchase-rate resolver: the customer's assignment, else the company's Faro agreement, else none
// with the reason named (never a silent 0%).
import { describe, expect, it, vi } from "vitest";
import { resolvePurchaseRate } from "../factor.service.js";

const client = (assignment: Record<string, unknown> | null, agreement: Record<string, unknown> | null) => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("customer_factor_assignment")) return { rows: assignment ? [assignment] : [] };
    if (sql.includes("canonical_factor_agreements")) return { rows: agreement ? [agreement] : [] };
    return { rows: [] };
  }),
});

const assignmentRow = { id: "f-1", name: "Faro", reserve_rate: "0.0150", cash_reserve_rate: "0", fee_rate: "0.0150", assignment_id: "a-1", effective_from: "2026-08-07", effective_to: null, active: true };

describe("resolvePurchaseRate", () => {
  it("uses the customer's own assignment first", async () => {
    const r = await resolvePurchaseRate(client(assignmentRow, null) as never, "co", "cust", "2026-10-02");
    expect(r).toMatchObject({ factor_id: "f-1", reserve: 0.015, fee: 0.015, source: "customer_assignment", reason: null });
  });

  it("falls back to the company's Faro agreement when the customer has no assignment (the six $0.00 invoices)", async () => {
    const r = await resolvePurchaseRate(client(null, { id: "f-1", name: "Faro", reserve_rate: "0.0150", cash_reserve_rate: "0", fee_rate: "0.0150" }) as never, "co", "cust", "2026-10-02");
    expect(r).toMatchObject({ factor_id: "f-1", reserve: 0.015, source: "company_agreement", reason: null });
  });

  it("names the reason when no agreement covers the customer — never a silent 0%", async () => {
    const r = await resolvePurchaseRate(client(null, null) as never, "co", "cust", "2026-10-02");
    expect(r.source).toBe("none");
    expect(r.reason).toMatch(/No factor agreement/);
  });
});
