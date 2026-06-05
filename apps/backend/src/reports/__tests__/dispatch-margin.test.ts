import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDispatchMarginRoutes } from "../dispatch-margin.routes.js";

const companyId = "44444444-4444-4444-8444-444444444444";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async () => ({
          rows: [
            {
              load_id: "11111111-1111-4111-8111-111111111111",
              load_number: "LD-100",
              customer_name: "Acme",
              revenue_cents: "250000",
              driver_pay_cents: "100000",
              fuel_cents: "30000",
              tolls_cents: "5000",
              chargebacks_cents: "0",
            },
          ],
        })),
      };
      return fn(client);
    }),
  };
});

describe("dispatch margin routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerDispatchMarginRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns per-load margin on happy path", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/dispatch-margin?operating_company_id=${companyId}&from=2026-04-01&to=2026-06-30&basis=accrual`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.basis).toBe("accrual");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].margin_cents).toBe(115000);
    expect(body.totals.load_count).toBe(1);
  });

  it("returns empty rows when no loads match", async () => {
    const { withCompanyScope } = await import("../shared.js");
    vi.mocked(withCompanyScope).mockImplementationOnce(async (_u, _c, fn) =>
      fn({ query: vi.fn(async () => ({ rows: [] })) })
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/dispatch-margin?operating_company_id=${companyId}&from=2026-01-01&to=2026-01-31`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([]);
    expect(res.json().totals.load_count).toBe(0);
  });

  it("rejects invalid date filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/dispatch-margin?operating_company_id=${companyId}&from=bad&to=2026-06-30`,
    });
    expect(res.statusCode).toBe(400);
  });
});
