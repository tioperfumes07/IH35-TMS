import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCustomerProfitabilityRoutes } from "../customer-profitability.routes.js";

const companyId = "33333333-3333-4333-8333-333333333333";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      let revenueAggCalls = 0;
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("GROUP BY l.customer_id") && sql.includes("revenue_cents")) {
            revenueAggCalls += 1;
            if (revenueAggCalls === 1) {
              return {
                rows: [
                  {
                    customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
                    revenue_cents: "200000",
                    load_count: "2",
                    last_load_at: "2026-05-15T12:00:00.000Z",
                  },
                ],
              };
            }
            return { rows: [] };
          }
          if (sql.includes("FROM driver_finance.driver_bills")) {
            return { rows: [{ customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", cost_cents: "50000" }] };
          }
          if (sql.includes("FROM accounting.invoices")) {
            return {
              rows: [{ customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", open_cents: "125000", past_due: true }],
            };
          }
          if (sql.includes("FROM mdata.customers")) {
            return { rows: [{ customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd", customer_name: "Acme" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

describe("customer-profitability.routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await registerCustomerProfitabilityRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("computes margins, filters revenue floors, and emits profitability flags", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-profitability?operating_company_id=${companyId}&period_start=2026-05-01&period_end=2026-05-31&min_revenue_cents=150000`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.by_customer).toHaveLength(1);
    expect(body.by_customer[0].gross_margin_cents).toBe(150000);
    expect(body.by_customer[0].flags).toContain("high_margin");
    expect(body.by_customer[0].flags).toContain("past_due");
    expect(body.totals.customer_count).toBe(1);
  });
});
