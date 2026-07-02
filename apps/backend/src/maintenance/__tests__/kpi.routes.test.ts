import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  assertKpiPeriod,
  buildDailySparkline,
  computeCpmCents,
  computeMtbfHours,
  computePmCompliancePct,
  registerMaintenanceKpiRoutes,
} from "../kpi.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  };
});

vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("maintenance KPI helpers (B35)", () => {
  it("validates KPI period ordering", () => {
    expect(assertKpiPeriod("2026-05-01", "2026-05-31")).toBe(true);
    expect(assertKpiPeriod("2026-06-01", "2026-05-01")).toBe(false);
  });

  it("computes PM compliance percent", () => {
    expect(computePmCompliancePct(8, 10)).toBe(80);
    expect(computePmCompliancePct(0, 0)).toBe(100);
  });

  it("computes MTBF and CPM metrics", () => {
    expect(computeMtbfHours(240, 2)).toBe(120);
    expect(computeMtbfHours(100, 0)).toBeNull();
    expect(computeCpmCents(50000, 1000)).toBe(50);
    expect(computeCpmCents(100, 0)).toBeNull();
  });

  it("fills daily sparkline buckets", () => {
    const series = buildDailySparkline(
      [
        { day: "2026-06-01", value: 2 },
        { day: "2026-06-03", value: 5 },
      ],
      "2026-06-01",
      "2026-06-03"
    );
    expect(series).toHaveLength(3);
    expect(series[1]?.value).toBe(0);
    expect(series[2]?.value).toBe(5);
  });

  it("registers KPI summary route", async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("wo_downtime_hours")) return { rows: [{ wo_downtime_hours: 4 }] };
      if (sql.includes("oos_hours")) return { rows: [{ oos_hours: 1 }] };
      if (sql.includes("failure_count")) return { rows: [{ failure_count: 2 }] };
      if (sql.includes("deactivated_at IS NULL")) return { rows: [{ c: 5 }] };
      if (sql.includes("truck_count")) return { rows: [{ total_cents: 10000, truck_count: 2 }] };
      if (sql.includes("miles_practical")) return { rows: [{ miles: 500 }] };
      if (sql.includes("compliant_schedules")) return { rows: [{ total_schedules: 4, compliant_schedules: 3 }] };
      return { rows: [] };
    });

    const app: FastifyInstance = Fastify();
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string } }).user = { uuid: "user-test-1" };
    });
    await registerMaintenanceKpiRoutes(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/kpi/summary?operating_company_id=${COMPANY}&period_start=2026-06-01&period_end=2026-06-07`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { downtime_hours: number; pm_compliance_pct: number };
    expect(body.downtime_hours).toBe(5);
    expect(body.pm_compliance_pct).toBe(75);
    await app.close();
  });
});
