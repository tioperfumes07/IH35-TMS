import { describe, expect, it, vi } from "vitest";
import { getReconWorklist } from "../recon-worklist.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../match.service.js", () => ({
  acceptMatchWithResolveDifference: vi.fn(),
  previewMatchVariance: vi.fn(),
}));

describe("bank recon worklist tenant isolation", () => {
  it("sets company scope and filters period scans by company and bank account", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM banking.bank_transactions bt")) return { rows: [] };
      if (sql.includes("FROM bank.reconciliation_matches rm")) return { rows: [] };
      if (sql.includes("WITH period_tx AS")) return { rows: [{ total_count: 0, matched_count: 0 }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [] };
      return { rows: [] };
    });

    await getReconWorklist({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      account_id: "22222222-2222-4222-8222-222222222222",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const unmatchedSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM banking.bank_transactions bt"))?.[0];
    expect(String(unmatchedSql)).toContain("bt.operating_company_id = $1::uuid");
    expect(String(unmatchedSql)).toContain("bt.bank_account_id = $2::uuid");
  });
});
