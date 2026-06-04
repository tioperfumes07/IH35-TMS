import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerReportsArAgingRoutes } from "../ar-aging.routes.js";

const companyId = "44444444-4444-4444-8444-444444444444";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("accounting.payments")) return { rows: [] };
          return {
            rows: [
              {
                customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                customer_name: "Beta Co",
                open_invoice_count: 2,
                bucket_0_30_cents: "10000",
                bucket_31_60_cents: "5000",
                bucket_61_90_cents: "0",
                bucket_91_plus_cents: "0",
                total_open_cents: "15000",
              },
            ],
          };
        }),
      };
      return fn(client);
    }),
  };
});

describe("ar aging report routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerArAgingRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns aging buckets on happy path", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ar-aging?operating_company_id=${companyId}&as_of_date=2026-06-01&basis=accrual`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.basis).toBe("accrual");
    expect(body.rows).toHaveLength(1);
    expect(body.totals.total_outstanding_cents).toBe(15000);
  });

  it("returns empty rows when no open invoices", async () => {
    const { withCompanyScope } = await import("../shared.js");
    vi.mocked(withCompanyScope).mockImplementationOnce(async (_u, _c, fn) =>
      fn({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("accounting.payments")) return { rows: [] };
          return { rows: [] };
        }),
      })
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ar-aging?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([]);
  });
});
