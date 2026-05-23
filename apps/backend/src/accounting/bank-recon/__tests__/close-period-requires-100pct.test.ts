import { describe, expect, it, vi } from "vitest";
import { closeReconPeriod } from "../recon-worklist.service.js";

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

describe("bank recon close period coverage gate", () => {
  it("rejects close when matched/skipped coverage is below 100%", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("WITH period_tx AS")) return { rows: [{ total_count: 10, covered_count: 9 }] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ closed_through: null }] };
      return { rows: [] };
    });

    await expect(
      closeReconPeriod({
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        account_id: "22222222-2222-4222-8222-222222222222",
        period_end: "2026-01-31",
        actor_user_uuid: "33333333-3333-4333-8333-333333333333",
      })
    ).rejects.toThrow("period_not_100pct_reconciled");
  });
});
