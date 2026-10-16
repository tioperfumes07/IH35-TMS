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

describe("factoring fees poster tenant isolation", () => {
  it("applies operating_company scope and company filter in reserve balance reads", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("WITH invoice_split AS")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances fa")) return { rows: [] };
      return { rows: [] };
    });

    mockReserveByCustomer.mockResolvedValue({ rows: [], total_reserve_now_cents: 0, gl_balance_cents: 0, ties_to_gl: true });
    await listFactorReserveBalances({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    // 443.168 L — the reserve rows are read for THIS company through the one reserve engine.
    expect(mockReserveByCustomer).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111", expect.any(String));
  });
});
