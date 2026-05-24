import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getProfitLossReport: vi.fn(),
  getBalanceSheetReport: vi.fn(),
  transformProfitLossToCashBasis: vi.fn((report) => report),
  transformBalanceSheetToCashBasis: vi.fn((report) => report),
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => unknown) => fn({ query: vi.fn() })),
  resolveRoleAccountOptional: vi.fn(async () => null),
}));

vi.mock("../profit-loss.service.js", () => ({
  getProfitLossReport: mocked.getProfitLossReport,
}));

vi.mock("../balance-sheet.service.js", () => ({
  getBalanceSheetReport: mocked.getBalanceSheetReport,
}));

vi.mock("../cash-basis/report-transforms.js", () => ({
  transformProfitLossToCashBasis: mocked.transformProfitLossToCashBasis,
  transformBalanceSheetToCashBasis: mocked.transformBalanceSheetToCashBasis,
}));

vi.mock("../shared.js", () => ({
  withCompanyScope: async (_userId: string, _companyId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => unknown) => fn({ query: vi.fn() }),
}));

vi.mock("../coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: mocked.resolveRoleAccountOptional,
}));

import { getComparisonReport } from "../comparison-report.service.js";

describe("comparison report service", () => {
  beforeEach(() => {
    mocked.getProfitLossReport.mockReset();
    mocked.getBalanceSheetReport.mockReset();
    mocked.transformProfitLossToCashBasis.mockClear();
    mocked.transformBalanceSheetToCashBasis.mockClear();
  });

  it("computes period-over-period PL variance safely", async () => {
    mocked.getProfitLossReport
      .mockResolvedValueOnce({
        revenue: { lines: [{ account_code: "4000", account_name: "Revenue", account_type: "Income", amount: 100_00 }], total: 100_00 },
        cogs: { lines: [], total: 0 },
        gross_profit: 100_00,
        operating_expenses: { lines: [], total: 0 },
        net_income: 100_00,
      })
      .mockResolvedValueOnce({
        revenue: { lines: [{ account_code: "4000", account_name: "Revenue", account_type: "Income", amount: 50_00 }], total: 50_00 },
        cogs: { lines: [], total: 0 },
        gross_profit: 50_00,
        operating_expenses: { lines: [], total: 0 },
        net_income: 50_00,
      });

    const report = await getComparisonReport({
      userId: "11111111-1111-4111-8111-111111111111",
      operatingCompanyId: "22222222-2222-4222-8222-222222222222",
      type: "pl",
      basis: "accrual",
      periods: "2026-Q1,2025-Q1",
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.period_1_amount).toBe(100_00);
    expect(report.rows[0]?.period_2_amount).toBe(50_00);
    expect(report.rows[0]?.variance_cents).toBe(50_00);
    expect(report.rows[0]?.variance_pct).toBe(100);
  });

  it("fails for invalid periods payload", async () => {
    await expect(
      getComparisonReport({
        userId: "11111111-1111-4111-8111-111111111111",
        operatingCompanyId: "22222222-2222-4222-8222-222222222222",
        type: "bs",
        basis: "cash",
        periods: "2026",
      })
    ).rejects.toThrow("invalid_periods");
  });
});
