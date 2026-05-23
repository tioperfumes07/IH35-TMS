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

describe("factoring fees poster tenant isolation", () => {
  it("applies operating_company scope and company filter in reserve balance reads", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("WITH invoice_split AS")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances fa")) return { rows: [] };
      return { rows: [] };
    });

    await listFactorReserveBalances({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const reserveSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes("WITH invoice_split AS"))?.[0];
    expect(String(reserveSql)).toContain("fa.operating_company_id = $1::uuid");
  });
});
