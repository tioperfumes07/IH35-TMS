import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
  luciaPool: {},
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(),
}));

import * as aggregated from "../aggregated.routes.js";

describe("payroll aggregated (P5-T25)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns driver_finance settlements only — no QBO payroll read (ACCT-F4431379)", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("driver_finance.driver_settlements")) {
        return {
          rows: [{ id: "s1", driver_id: "d1", net_cents: 10000, status: "draft" }],
        };
      }
      return { rows: [] };
    });

    const payload = await aggregated.fetchAggregatedPayroll({ query: queryMock }, "oc-1");
    expect(payload.option).toBe("B");
    expect(payload.driver_settlements).toHaveLength(1);
    expect(payload).not.toHaveProperty("qbo_w2_runs");
    const sqls = queryMock.mock.calls.map((c) => String(c[0]) + JSON.stringify(c[1] ?? []));
    expect(sqls.some((s) => s.includes("qbo_payroll_links"))).toBe(false);
  });

  it("no longer exposes the QBO mirror refresh write", () => {
    expect((aggregated as Record<string, unknown>).refreshAggregatedPayrollSync).toBeUndefined();
  });
});
