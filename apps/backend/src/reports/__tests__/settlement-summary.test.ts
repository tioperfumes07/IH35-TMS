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
          if (sql.includes("FROM driver_finance.settlement_lines")) {
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
    expect(body.by_driver[0].load_count).toBe(4);
  });
});

// SETTLEMENT-SUMMARY-LOAD-COUNT-WRONG-DATE-AXIS: load_count used to come from mdata.loads filtered
// by created_at (booking date) BETWEEN the report's own period AND assigned_primary_driver_id (the
// load's CURRENT live assignment) -- neither of which reflects the settlement's own linkage. A
// driver settled for a load booked well outside the settlement's own period (the settlement period
// is when it was CLOSED, not when the underlying load was booked) showed load_count = 0 despite
// having a real settlement_lines row for that exact load. Live-confirmed on prod: driver Juan
// USMCA-Battery, settlement period 2026-08-21, real load booked 2026-08-02 (19 days earlier),
// gross $1,104.00 exact match -- report showed 0 loads.
describe("settlement-summary.routes load_count derivation", () => {
  let app: FastifyInstance;
  const driverId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const settlementId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  beforeEach(async () => {
    vi.doMock("../shared.js", async () => {
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
                      id: settlementId,
                      driver_id: driverId,
                      driver_name: "Juan USMCA-Battery",
                      gross_cents: "110400",
                      deduction_cents: "0",
                      net_cents: "110400",
                    },
                  ],
                };
              }
              if (sql.includes("FROM driver_finance.driver_settlement_deductions")) {
                return { rows: [] };
              }
              // The load-count query must derive from settlement_lines, scoped to the settlement id
              // already selected above -- never from mdata.loads on an unrelated date axis.
              if (sql.includes("FROM driver_finance.settlement_lines")) {
                return { rows: [{ driver_id: driverId, load_count: "1" }] };
              }
              if (sql.includes("FROM mdata.loads")) {
                throw new Error(
                  "settlement-summary must not query mdata.loads for load_count -- use driver_finance.settlement_lines"
                );
              }
              return { rows: [] };
            }),
          };
          return fn(client);
        }),
      };
    });
    vi.resetModules();
    const mod = await import("../settlement-summary.routes.js");
    app = Fastify();
    await mod.registerSettlementSummaryRoutes(app);
  });

  afterEach(async () => {
    await app.close();
    vi.doUnmock("../shared.js");
    vi.resetModules();
  });

  it("resolves load_count from settlement_lines even when the settlement's own period is far from the load's booking date", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/settlement-summary?operating_company_id=${companyId}&period_start=2026-08-21&period_end=2026-08-21`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.by_driver[0].load_count).toBe(1);
  });
});
