import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProfitPerTruckRoutes } from "../profit-per-truck.routes.js";

const companyId = "44444444-4444-4444-8444-444444444444";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("fuel.fuel_transactions")) {
            return { rows: [{ unit_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", fuel_cents: "25000" }] };
          }
          if (sql.includes("FROM mdata.drivers")) {
            return { rows: [{ id: "ffffffff-ffff-ffff-ffff-ffffffffffff", full_name: "Lead Driver" }] };
          }
          if (sql.includes("JOIN agg ON agg.unit_id")) {
            return {
              rows: [
                {
                  unit_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
                  unit_number: "UNIT-1",
                  revenue_cents: "500000",
                  miles_driven: "1000",
                  load_count: "5",
                  truck_type: "dry_van",
                  driver_pay_cents: "200000",
                  maintenance_cents: "50000",
                  primary_driver_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                },
                {
                  unit_id: "99999999-9999-4999-8999-999999999999",
                  unit_number: "UNIT-2",
                  revenue_cents: "100000",
                  miles_driven: "50",
                  load_count: "1",
                  truck_type: "flatbed",
                  driver_pay_cents: "40000",
                  maintenance_cents: "5000",
                  primary_driver_id: null,
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

describe("profit-per-truck.routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await registerProfitPerTruckRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns enriched profitability totals when period bounds are provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/profit-per-truck?operating_company_id=${companyId}&period_start=2026-05-01&period_end=2026-05-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.by_truck).toHaveLength(2);
    expect(body.totals.revenue_cents).toBe(600000);
    expect(body.by_truck[0].flags).toContain("most_profitable");
    expect(body.by_truck[1].flags).toContain("underutilized");
    expect(body.by_truck[0].primary_driver_name).toBe("Lead Driver");
    expect(body.by_truck[0].fuel_cents).toBe(25000);
  });
});
