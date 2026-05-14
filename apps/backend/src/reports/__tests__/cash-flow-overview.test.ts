import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCashFlowOverviewRoutes } from "../cash-flow-overview.routes.js";

const companyId = "11111111-1111-4111-8111-111111111111";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("FROM banking.bank_accounts")) {
            return { rows: [{ payroll_cents: "10000", dip_cents: "5000", total_cents: "25000" }] };
          }
          if (sql.includes("FROM views.factoring_summary")) {
            return { rows: [{ reserve_balance: "12.34", mtd_advanced_total: "56.78", chargeback_balance: "9.01" }] };
          }
          if (sql.includes("COUNT(*)") && sql.includes("bank_transactions") && sql.includes("plaid_category")) {
            return { rows: [{ c: "3" }] };
          }
          if (sql.includes("FROM accounting.invoices")) {
            return { rows: [{ amt: "900000" }] };
          }
          if (sql.includes("FROM accounting.bills")) {
            return { rows: [{ amt: "400000" }] };
          }
          if (sql.includes("FROM driver_finance.driver_settlements")) {
            return { rows: [{ amt: "250000" }] };
          }
          if (sql.includes("INTERVAL '7 days'")) {
            return { rows: [{ inflow: "7000", outflow: "3000" }] };
          }
          if (sql.includes("INTERVAL '30 days'")) {
            return { rows: [{ inflow: "30000", outflow: "15000" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

describe("cash-flow-overview.routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await registerCashFlowOverviewRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("aggregates balances, factoring, projections, and historical averages", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/cash-flow-overview?operating_company_id=${companyId}&as_of_date=2026-05-01`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.current_state.operating_balance_cents).toBe(10000);
    expect(body.current_state.payroll_balance_cents).toBe(10000);
    expect(body.current_state.dip_balance_cents).toBe(5000);
    expect(body.current_state.factoring_reserves_held_cents).toBe(1234);
    expect(body.current_state.uncategorized_transactions_count).toBe(3);
    expect(body.next_30_days.net_projected_change_cents).toBe(900000 - 400000 - 250000);
    expect(body.historical.last_30_days_avg_daily_inflow_cents).toBe(1000);
    expect(body.historical.last_30_days_avg_daily_outflow_cents).toBe(500);
  });
});
