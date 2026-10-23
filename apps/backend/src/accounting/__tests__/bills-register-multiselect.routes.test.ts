import Fastify from "fastify";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), list: vi.fn(), totals: vi.fn() }));
vi.mock("../shared.js", async () => ({
  ...await vi.importActual<typeof import("../shared.js")>("../shared.js"),
  currentAuthUser: () => ({ uuid: "11111111-1111-4111-8111-111111111111", role: "Owner" }),
  withCompanyScope: async (_u: string, _c: string, fn: (c: unknown) => unknown) => fn({ query: mocks.query }),
}));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));
vi.mock("../bills.service.js", async () => ({
  ...await vi.importActual<typeof import("../bills.service.js")>("../bills.service.js"),
  listBills: mocks.list, aggregateBillsForRegister: mocks.totals,
}));
import { registerBillsRoutes, DRIVER_BILL_REGISTER_SQL, DRIVER_BILL_REGISTER_TOTAL_SQL } from "../bills.routes.js";

it("mounted register binds the full unit/load selection to both cohorts and returns totals beyond the page", async () => {
  const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
  mocks.list.mockResolvedValue([{ amount_cents: 100 }]);
  mocks.totals.mockResolvedValue({ count: 101, amount_cents: 10100 });
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql === DRIVER_BILL_REGISTER_SQL
    ? [{ gross_amount_cents: 200 }] : sql === DRIVER_BILL_REGISTER_TOTAL_SQL
      ? [{ count: 102, amount_cents: 20400 }] : [{ n: 0 }] }));
  const app = Fastify();
  await registerBillsRoutes(app);
  try {
    const response = await app.inject({ method: "GET", url: `/api/v1/accounting/bills/register?operating_company_id=11111111-1111-4111-8111-111111111111&load_id=${ids.join(",")}&unit_id=${ids.join(",")}&limit=1&offset=1` });
    expect(response.statusCode).toBe(200);
    expect(response.json().rows).toHaveLength(2);
    expect(response.json().totals).toEqual({ vendor_bill: { count: 101, amount_cents: 10100 }, driver_bill: { count: 102, amount_cents: 20400 } });
    for (const sql of [DRIVER_BILL_REGISTER_SQL, DRIVER_BILL_REGISTER_TOTAL_SQL]) {
      const call = mocks.query.mock.calls.find(([s]) => s === sql)!;
      expect(call[1][6]).toEqual(ids);
      expect(call[1][11]).toEqual(ids);
      expect(sql).toContain("db.load_id = ANY($7::uuid[])");
      expect(sql).toContain("db.unit_id = ANY($12::uuid[])");
    }
    expect(DRIVER_BILL_REGISTER_TOTAL_SQL).not.toContain("LIMIT");
    expect(mocks.list.mock.calls[0][2]).toMatchObject({ unitId: ids.join(","), loadId: ids.join(",") });
    expect(mocks.totals.mock.calls[0][2]).toMatchObject({ unitId: ids.join(","), loadId: ids.join(",") });
  } finally { await app.close(); }
});
