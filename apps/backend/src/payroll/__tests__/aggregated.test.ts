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

import { fetchAggregatedPayroll, refreshAggregatedPayrollSync } from "../aggregated.routes.js";

describe("payroll aggregated (P5-T25)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns driver settlements and qbo w2 runs", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("payroll.driver_settlements")) {
        return {
          rows: [{ id: "s1", driver_id: "d1", net_cents: 10000, status: "draft" }],
        };
      }
      if (sql.includes("integrations.qbo_payroll_links") && sql.includes("GROUP BY")) {
        return { rows: [{ sync_state: "idle", last_synced_at: null }] };
      }
      if (sql.includes("integrations.qbo_payroll_links")) {
        return {
          rows: [{ qbo_payroll_run_id: "pr1", net_cents: 500000, employee_count: 3 }],
        };
      }
      return { rows: [] };
    });

    const payload = await fetchAggregatedPayroll({ query: queryMock }, "oc-1");
    expect(payload.option).toBe("B");
    expect(payload.driver_settlements).toHaveLength(1);
    expect(payload.qbo_w2_runs).toHaveLength(1);
  });

  it("refresh updates sync state", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("UPDATE integrations.qbo_payroll_links")) return { rows: [{ id: "l1" }] };
      return { rows: [] };
    });
    const payload = await refreshAggregatedPayrollSync({ query: queryMock }, "oc-1");
    expect(payload.sync_state).toBe("polled");
    expect(payload.updated_rows).toBe(1);
  });

  it("handles missing payroll links table", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      return { rows: [] };
    });
    const payload = await fetchAggregatedPayroll({ query: queryMock }, "oc-1");
    expect(payload.qbo_w2_runs).toEqual([]);
    expect(payload.sync_state).toBe("idle");
  });
});
