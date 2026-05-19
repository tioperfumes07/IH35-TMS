import { beforeEach, describe, expect, it, vi } from "vitest";

const withCurrentUserMock = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: (...args: unknown[]) => withCurrentUserMock(...args),
}));

describe("trial balance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns TB row shape and balanced summary for TRANSP company scope", async () => {
    const companyId = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
    const userId = "e4117991-d2c0-406d-8cda-74e98d95bccd";

    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
        return {
          rows: [
            {
              account_id: "11111111-1111-4111-8111-111111111111",
              account_code: "1200",
              account_name: "Accounts Receivable",
              account_type: "Asset",
              total_debits: "5000",
              total_credits: "0",
            },
            {
              account_id: "22222222-2222-4222-8222-222222222222",
              account_code: "4000",
              account_name: "Revenue",
              account_type: "Income",
              total_debits: "0",
              total_credits: "5000",
            },
          ],
        };
      }),
    };

    withCurrentUserMock.mockImplementation(async (_uid: string, fn: (c: typeof client) => Promise<unknown>) => fn(client));

    const mod = await import("./trial-balance.service.js");
    const report = await mod.getTrialBalanceReport({
      userId,
      operating_company_id: companyId,
    });

    expect(Array.isArray(report.rows)).toBe(true);
    expect(report.rows.length).toBe(2);
    expect(report.rows[0]).toMatchObject({
      account_id: "11111111-1111-4111-8111-111111111111",
      account_code: "1200",
      account_name: "Accounts Receivable",
      account_type: "Asset",
      total_debits: 5000,
      total_credits: 0,
      net_balance: 5000,
    });
    expect(report.summary).toMatchObject({
      grand_total_debits: 5000,
      grand_total_credits: 5000,
      balanced: true,
    });
    expect(typeof report.summary.balanced).toBe("boolean");
  });
});
