import { describe, expect, it, vi } from "vitest";
import { listReconciliationRuns } from "../recon.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

describe("factor reconciliation tenant isolation", () => {
  it("sets app.operating_company_id and filters runs by operating company", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM factor.reconciliation_runs r")) return { rows: [] };
      return { rows: [] };
    });

    await listReconciliationRuns({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      limit: 50,
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);
    const runsSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM factor.reconciliation_runs r"))?.[0];
    expect(String(runsSql)).toContain("r.operating_company_id = $1::uuid");
  });
});
