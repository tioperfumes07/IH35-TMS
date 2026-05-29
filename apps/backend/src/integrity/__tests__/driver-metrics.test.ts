import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDriverMetricSnapshots,
  buildDriverMetricsAggregationSql,
  buildDriverMetricsLeaderboard,
  computePeerComparison,
  deriveDriverMetricValues,
  resolvePeriodBounds,
  type DriverMetricRawRow,
} from "../driver-metrics.service.js";
import { registerDriverMetricsRoutes } from "../driver-metrics.routes.js";

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: () => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
    fn({
      query: async () => ({
        rows: [
          {
            driver_id: "11111111-1111-4111-8111-111111111111",
            driver_name: "Test Driver",
            fuel_spend: 500,
            gallons: 100,
            odometer_delta: 1000,
            wo_count: 2,
            accident_count: 0,
            tire_lines: 1,
            battery_lines: 0,
            airbag_lines: 0,
            brake_lines: 0,
            avg_repair_cost: 250,
          },
        ],
      }),
    }),
}));

function makeRow(overrides: Partial<DriverMetricRawRow> & Pick<DriverMetricRawRow, "driver_id" | "driver_name">): DriverMetricRawRow {
  return {
    fuel_spend: 0,
    gallons: 0,
    odometer_delta: 0,
    wo_count: 0,
    accident_count: 0,
    tire_lines: 0,
    battery_lines: 0,
    airbag_lines: 0,
    brake_lines: 0,
    avg_repair_cost: null,
    ...overrides,
  };
}

describe("resolvePeriodBounds", () => {
  it("resolves monthly, quarterly, and ytd windows from as-of date", () => {
    expect(resolvePeriodBounds("monthly", "2026-05-28")).toEqual({
      period: "monthly",
      asof: "2026-05-28",
      period_start: "2026-05-01",
      period_end: "2026-05-29",
      months_active: 1,
    });
    expect(resolvePeriodBounds("quarterly", "2026-05-28")).toMatchObject({
      period: "quarterly",
      asof: "2026-05-28",
      period_start: "2026-04-01",
      period_end: "2026-05-29",
      months_active: 3,
    });
    expect(resolvePeriodBounds("ytd", "2026-05-28")).toMatchObject({
      period: "ytd",
      asof: "2026-05-28",
      period_start: "2026-01-01",
      period_end: "2026-05-29",
      months_active: 5,
    });
  });
});

describe("computePeerComparison", () => {
  it("flags values above the peer median ratio threshold", () => {
    const comparison = computePeerComparison(150, [80, 90, 100, 110, 120], 1.5);
    expect(comparison.peer_median).toBe(100);
    expect(comparison.ratio_to_median).toBe(1.5);
    expect(comparison.flagged).toBe(false);

    const flagged = computePeerComparison(151, [80, 90, 100, 110, 120], 1.5);
    expect(flagged.flagged).toBe(true);
  });
});

describe("driver metrics aggregation fixtures", () => {
  const bounds = resolvePeriodBounds("monthly", "2026-05-31");
  const fixtureRows: DriverMetricRawRow[] = [
    makeRow({ driver_id: "d01", driver_name: "Driver 01", fuel_spend: 500, odometer_delta: 1000, wo_count: 2, accident_count: 0, tire_lines: 1, brake_lines: 0, avg_repair_cost: 200 }),
    makeRow({ driver_id: "d02", driver_name: "Driver 02", fuel_spend: 600, odometer_delta: 1000, wo_count: 4, accident_count: 1, tire_lines: 2, brake_lines: 1, avg_repair_cost: 400 }),
    makeRow({ driver_id: "d03", driver_name: "Driver 03", fuel_spend: 700, odometer_delta: 1000, wo_count: 6, accident_count: 2, tire_lines: 3, brake_lines: 2, avg_repair_cost: 600 }),
    makeRow({ driver_id: "d04", driver_name: "Driver 04", fuel_spend: 800, odometer_delta: 1000, wo_count: 8, accident_count: 0, tire_lines: 0, brake_lines: 0, avg_repair_cost: 800 }),
    makeRow({ driver_id: "d05", driver_name: "Driver 05", fuel_spend: 900, odometer_delta: 1000, wo_count: 10, accident_count: 1, tire_lines: 1, brake_lines: 1, avg_repair_cost: 1000 }),
    makeRow({ driver_id: "d06", driver_name: "Driver 06", fuel_spend: 1000, odometer_delta: 1000, wo_count: 1, accident_count: 0, tire_lines: 0, brake_lines: 0, avg_repair_cost: 100 }),
    makeRow({ driver_id: "d07", driver_name: "Driver 07", fuel_spend: 1100, odometer_delta: 1000, wo_count: 3, accident_count: 1, tire_lines: 2, brake_lines: 1, avg_repair_cost: 300 }),
    makeRow({ driver_id: "d08", driver_name: "Driver 08", fuel_spend: 1200, odometer_delta: 1000, wo_count: 5, accident_count: 0, tire_lines: 1, brake_lines: 0, avg_repair_cost: 500 }),
    makeRow({ driver_id: "d09", driver_name: "Driver 09", fuel_spend: 1300, odometer_delta: 1000, wo_count: 7, accident_count: 2, tire_lines: 3, brake_lines: 2, avg_repair_cost: 700 }),
    makeRow({ driver_id: "d10", driver_name: "Driver 10", fuel_spend: 3000, odometer_delta: 1000, wo_count: 12, accident_count: 3, tire_lines: 4, brake_lines: 3, avg_repair_cost: 1200 }),
  ];

  it("derives expected monthly metric values for a driver row", () => {
    const values = deriveDriverMetricValues(fixtureRows[9]!, bounds.months_active);
    expect(values.fuel_per_mile).toBe(3);
    expect(values.repairs_per_month).toBe(12);
    expect(values.accidents_per_quarter).toBe(3);
    expect(values.tire_replacement_rate).toBe(4);
    expect(values.average_repair_cost).toBe(1200);
  });

  it("builds peer medians and flags for ten-driver fixture", () => {
    const snapshots = buildDriverMetricSnapshots(fixtureRows, bounds);
    const outlier = snapshots.find((entry) => entry.driver_id === "d10");
    expect(outlier?.metrics.fuel_per_mile.peer_median).toBe(0.95);
    expect(outlier?.metrics.fuel_per_mile.flagged).toBe(true);
    expect(outlier?.metrics.repairs_per_month.flagged).toBe(true);

    const medianDriver = snapshots.find((entry) => entry.driver_id === "d05");
    expect(medianDriver?.metrics.fuel_per_mile.value).toBe(0.9);
    expect(medianDriver?.metrics.fuel_per_mile.peer_median).toBe(0.95);
  });

  it("includes core aggregation sources in SQL", () => {
    const sql = buildDriverMetricsAggregationSql();
    expect(sql).toContain("fuel.fuel_transactions");
    expect(sql).toContain("maintenance.work_orders");
    expect(sql).toContain("safety.accident_reports");
    expect(sql).toContain("maint.part");
  });

  it("sorts leaderboard rows by metric direction", () => {
    const snapshots = buildDriverMetricSnapshots(fixtureRows, bounds);
    const high = buildDriverMetricsLeaderboard(snapshots, "fuel_per_mile", "high", 3);
    expect(high.map((row) => row.driver_id)).toEqual(["d10", "d09", "d08"]);

    const low = buildDriverMetricsLeaderboard(snapshots, "repairs_per_month", "low", 3);
    expect(low.map((row) => row.driver_id)).toEqual(["d06", "d01", "d07"]);
  });
});

describe("driver metrics routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "22222222-2222-4222-8222-222222222222",
        role: "Owner",
      };
    });
    await registerDriverMetricsRoutes(app);
    return app;
  }

  it("returns driver metrics payload for a valid query", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrity/driver-metrics?operating_company_id=33333333-3333-4333-8333-333333333333&driver_id=11111111-1111-4111-8111-111111111111&period=monthly&asof=2026-05-31",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { driver: { driver_id: string }; period: { period: string } };
    expect(body.driver.driver_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.period.period).toBe("monthly");
  });

  it("returns sorted leaderboard rows", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrity/driver-metrics/leaderboard?operating_company_id=33333333-3333-4333-8333-333333333333&metric=fuel_per_mile&period=monthly&asof=2026-05-31&limit=5",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { rows: Array<{ rank: number; driver_id: string }> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.rank).toBe(1);
  });
});
