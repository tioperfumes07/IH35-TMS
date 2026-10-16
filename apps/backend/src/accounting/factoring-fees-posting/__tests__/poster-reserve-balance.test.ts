import { describe, expect, it, vi } from "vitest";
import { listFactorReserveBalances } from "../poster.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

// LEAD 443.168 L (E-46) — the per-customer reserve comes from the ONE reserve engine.
const { mockReserveByCustomer } = vi.hoisted(() => ({ mockReserveByCustomer: vi.fn() }));
vi.mock("../../../factoring/reserve-by-customer.service.js", () => ({ reserveByCustomer: mockReserveByCustomer }));

describe("factoring reserve balances", () => {
  it("returns reserve accrual/release totals for card rendering", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("ORDER BY COALESCE(fa.released_at")) {
        return {
          rows: [
            {
              factoring_advance_id: "fac-1",
              display_id: "FAC-0001",
              customer_id: "cus-1",
              customer_name: "Customer A",
              status: "released",
              reserve_amount_cents: 200000,
              release_amount_cents: 180000,
              factor_fee_cents: 20000,
              occurred_at: "2026-02-20T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    mockReserveByCustomer.mockResolvedValue({
      rows: [{ customer_id: "cus-1", customer_name: "Customer A", held_cents: 200000, reserve_now_cents: 20000 }],
      total_reserve_now_cents: 20000,
      gl_balance_cents: 20000,
      ties_to_gl: true,
    });
    const payload = await listFactorReserveBalances({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]).toEqual(
      expect.objectContaining({
        customer_name: "Customer A",
        reserve_balance_cents: 20000,
        reserve_accrued_cents: 200000,
        reserve_released_cents: 180000,
      })
    );
    // Never the old proportional split of advance-header reserve amounts (a second reserve figure).
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("WITH invoice_split AS"))).toBe(false);
    expect(payload.recent_events[0]).toEqual(
      expect.objectContaining({
        display_id: "FAC-0001",
        factor_fee_cents: 20000,
      })
    );
  });
});
