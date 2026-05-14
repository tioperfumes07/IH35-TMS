import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSettlementSummaryRoutes } from "../settlement-summary.routes.js";

const companyId = "22222222-2222-4222-8222-222222222222";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("FROM driver_finance.driver_settlements")) {
            return {
              rows: [
                {
                  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                  driver_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                  driver_name: "Test Driver",
                  gross_cents: "100000",
                  deduction_cents: "10000",
                  net_cents: "85000",
                },
              ],
            };
          }
          if (sql.includes("FROM driver_finance.driver_settlement_deductions")) {
            return {
              rows: [
                {
                  deduction_type: "fuel_advance",
                  reason: "Fuel advance",
                  amount_cents: "6000",
                  applied_to_settlement_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                },
                {
                  deduction_type: "manual",
                  reason: "chargeback reserve",
                  amount_cents: "5000",
                  applied_to_settlement_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                },
              ],
            };
          }
          if (sql.includes("FROM mdata.loads")) {
            return { rows: [{ driver_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", load_count: "4" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

describe("settlement-summary.routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await registerSettlementSummaryRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("rolls up settlements, deduction buckets, and chargebacks", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/settlement-summary?operating_company_id=${companyId}&period_start=2026-05-01&period_end=2026-05-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.totals.gross_pay_cents).toBe(100000);
    expect(body.totals.settlement_count).toBe(1);
    expect(body.by_driver[0].deductions_breakdown.fuel_advance).toBe(6000);
    expect(body.by_driver[0].deductions_breakdown.abandonment_chargeback).toBe(5000);
    expect(body.by_driver[0].chargeback_cents).toBe(5000);
    expect(body.by_deduction_type.fuel_advance).toBe(6000);
    expect(body.by_deduction_type.manual).toBe(5000);
  });
});
