import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverSettlementSummaryRoutes } from "../driver-settlement-summary.routes.js";

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
              driver_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              driver_name: "Alex Driver",
              gross_cents: "100000",
              deductions_cents: "10000",
              advances_cents: "5000",
              escrow_cents: "2000",
              net_cents: "83000",
              status: "paid",
            },
          ],
        })),
      };
      return fn(client);
    }),
  };
});

describe("driver settlement summary routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerDriverSettlementSummaryRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns settlement rows for a cycle window", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlement-summary?operating_company_id=${companyId}&cycle_start=2026-04-01&cycle_end=2026-04-30&basis=accrual`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.basis).toBe("accrual");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].net_cents).toBe("83000");
  });

  it("returns empty rows when no settlements match", async () => {
    const { withCompanyScope } = await import("../shared.js");
    vi.mocked(withCompanyScope).mockImplementationOnce(async (_u, _c, fn) =>
      fn({ query: vi.fn(async () => ({ rows: [] })) })
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlement-summary?operating_company_id=${companyId}&cycle_start=2026-01-01&cycle_end=2026-01-31`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([]);
  });
});
