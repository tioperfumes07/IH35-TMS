import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProfitPerTruckRoutes } from "../profit-per-truck.routes.js";

// G9-H5 regression guard: profit-per-truck must NOT double-count via a JOIN fan-out and must
// exclude cancelled loads from revenue.
//
// The legacy (month-only) path previously joined mdata.units → mdata.loads → maintenance.work_orders
// directly in one query. For a unit with N loads and M work orders that produces N×M rows, so
// SUM(rate_total_cents) counted each load M times and SUM(work-order cost) counted each WO N times.
// The fix aggregates loads and work orders in separate per-unit CTEs (load_agg / wo_agg) joined by
// unit_id, so each economic row is counted exactly once.

const companyId = "44444444-4444-4444-8444-444444444444";

const capturedSql: string[] = [];

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          capturedSql.push(sql);
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

function sqlMatching(pred: (s: string) => boolean): string {
  const found = capturedSql.find(pred);
  expect(found, "expected a captured SQL statement matching predicate").toBeTruthy();
  return found as string;
}

describe("profit-per-truck G9-H5 — no double-count + cancelled excluded", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    capturedSql.length = 0;
    app = Fastify();
    await registerProfitPerTruckRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("legacy (month) query aggregates loads/work-orders in separate CTEs — no units×loads×work_orders fan-out", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/profit-per-truck?operating_company_id=${companyId}&month=2026-05`,
    });
    expect(res.statusCode).toBe(200);

    const legacy = sqlMatching((s) => s.includes("wo_cost_cents") && s.includes("mdata.units u"));

    // The fan-out signature: units directly LEFT JOINed to BOTH loads and work_orders in the same query.
    // After the fix, mdata.loads/work_orders are only referenced inside the pre-aggregated CTEs.
    expect(legacy).toContain("load_agg");
    expect(legacy).toContain("wo_agg");
    expect(legacy).not.toMatch(/LEFT JOIN\s+mdata\.loads\s+l\b/);
    expect(legacy).not.toMatch(/LEFT JOIN\s+maintenance\.work_orders\s+wo\b/);
    // cancelled loads must be excluded from revenue
    expect(legacy).toMatch(/status IS DISTINCT FROM 'cancelled'/);
  });

  it("extended (period) query excludes cancelled loads from the load scope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/profit-per-truck?operating_company_id=${companyId}&period_start=2026-05-01&period_end=2026-05-31&basis=accrual`,
    });
    expect(res.statusCode).toBe(200);

    const scope = sqlMatching((s) => s.includes("WITH load_scope AS"));
    expect(scope).toMatch(/status IS DISTINCT FROM 'cancelled'/);
    // fuel attribution must also drop cancelled loads
    const fuel = sqlMatching((s) => s.includes("fuel.fuel_transactions"));
    expect(fuel).toMatch(/status IS DISTINCT FROM 'cancelled'/);
  });
});
