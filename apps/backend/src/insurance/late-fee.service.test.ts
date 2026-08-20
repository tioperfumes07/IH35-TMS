import { beforeEach, describe, expect, it, vi } from "vitest";

const { withLuciaBypassMock } = vi.hoisted(() => ({
  withLuciaBypassMock: vi.fn(),
}));

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

/**
 * ACCT-F5628 — applyLateFee() was a complete, correct, per-row money function (the ONLY code that
 * ever writes insurance.payment_schedule.late_fee_cents / sets status='late_fee_applied') that was
 * never called from anywhere. applyOverdueLateFeesForTenant() is the sweep that closes the gap:
 * finds every past-due, not-yet-terminal schedule row and applies the existing function to each.
 *
 * Mock pattern mirrors the sibling payment-reminder.service.test.ts exactly: withLuciaBypass is
 * mocked once, and since both applyOverdueLateFeesForTenant's own SELECT AND applyLateFee's UPDATE
 * each open their own withLuciaBypass call, the mock's client.query implementation branches on SQL
 * text (SELECT vs the candidate/UPDATE inside applyLateFee) rather than on call order.
 */
describe("insurance late fee service — ACCT-F5628", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculateLateFee computes the percentage correctly, floored at zero", async () => {
    const { calculateLateFee } = await import("./late-fee.service.js");
    expect(calculateLateFee(10_000, 5)).toBe(500n);
    expect(calculateLateFee(10_000, 0)).toBe(0n);
    expect(calculateLateFee(-100, 5)).toBe(0n);
  });

  it("applyOverdueLateFeesForTenant scans past-due rows and applies the fee to each via applyLateFee", async () => {
    const { applyOverdueLateFeesForTenant } = await import("./late-fee.service.js");
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const rowA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const rowB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
          // applyLateFee's own WITH-candidate UPDATE, called once per row by the sweep — checked
          // FIRST since its own inner SELECT also matches "FROM insurance.payment_schedule".
          if (sql.includes("WITH candidate AS")) {
            const id = String(values?.[0] ?? "");
            return { rows: [{ id, late_fee_cents: "500", status: "late_fee_applied" }] };
          }
          // The sweep's own candidate SELECT (a plain query, not the WITH-candidate UPDATE above).
          if (sql.includes("SELECT id::text") && sql.includes("FROM insurance.payment_schedule")) {
            return { rows: [{ id: rowA }, { id: rowB }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const result = await applyOverdueLateFeesForTenant(tenantId, "2026-06-10");

    expect(result.scanned).toBe(2);
    expect(result.applied).toBe(2);
  });

  it("scans zero rows and applies nothing when there is no overdue schedule", async () => {
    const { applyOverdueLateFeesForTenant } = await import("./late-fee.service.js");

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
          if (sql.includes("FROM insurance.payment_schedule")) return { rows: [] };
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const result = await applyOverdueLateFeesForTenant("22222222-2222-4222-8222-222222222222", "2026-06-10");
    expect(result).toEqual({ scanned: 0, applied: 0 });
  });
});
