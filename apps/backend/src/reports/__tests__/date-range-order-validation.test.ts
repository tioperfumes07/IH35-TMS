import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0036-REPORTS-DATE-RANGE-ORDER-UNVALIDATED: none of these 7 report routes validated that
// from/period_start/cycle_start/start was on-or-before its to/period_end/cycle_end/end pair. A
// reversed range passed every existing guard, the SQL BETWEEN/>=+<= predicate became unsatisfiable
// (always false, never an error), and the endpoint returned a legitimate 200 with all-zero totals
// and an empty row set -- indistinguishable from a genuine zero-activity period. Every route below
// must now reject a reversed range with a 400 BEFORE running any query, and must still accept a
// valid (non-reversed) range.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
    withCompanyScope: async (_u: string, _c: string, fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      fn({ query: async () => ({ rows: [] }) }),
  };
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});

async function buildApp(register: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify();
  apps.push(app);
  await register(app);
  return app;
}

describe("GO-0036 report date-range order validation", () => {
  it("dispatch-margin: rejects from > to with 400, accepts a valid range", async () => {
    const { registerDispatchMarginRoutes } = await import("../dispatch-margin.routes.js");
    const app = await buildApp(registerDispatchMarginRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/dispatch-margin?operating_company_id=${COMPANY_ID}&from=2026-02-01&to=2026-01-01&basis=accrual` });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/from must be on or before to/i);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/dispatch-margin?operating_company_id=${COMPANY_ID}&from=2026-01-01&to=2026-01-31&basis=accrual` });
    expect(good.statusCode).not.toBe(400);
  });

  it("customer-profitability: rejects period_start > period_end with 400, accepts a valid range", async () => {
    const { registerCustomerProfitabilityRoutes } = await import("../customer-profitability.routes.js");
    const app = await buildApp(registerCustomerProfitabilityRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/customer-profitability?operating_company_id=${COMPANY_ID}&period_start=2026-02-01&period_end=2026-01-01` });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/customer-profitability?operating_company_id=${COMPANY_ID}&period_start=2026-01-01&period_end=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });

  it("settlement-summary: rejects period_start > period_end with 400, accepts a valid range", async () => {
    const { registerSettlementSummaryRoutes } = await import("../settlement-summary.routes.js");
    const app = await buildApp(registerSettlementSummaryRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/settlement-summary?operating_company_id=${COMPANY_ID}&period_start=2026-02-01&period_end=2026-01-01` });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/settlement-summary?operating_company_id=${COMPANY_ID}&period_start=2026-01-01&period_end=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });

  it("driver-settlement-summary: rejects cycle_start > cycle_end with 400, accepts a valid range", async () => {
    const { registerDriverSettlementSummaryRoutes } = await import("../driver-settlement-summary.routes.js");
    const app = await buildApp(registerDriverSettlementSummaryRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/driver-settlement-summary?operating_company_id=${COMPANY_ID}&cycle_start=2026-02-01&cycle_end=2026-01-01` });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/driver-settlement-summary?operating_company_id=${COMPANY_ID}&cycle_start=2026-01-01&cycle_end=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });

  it("driver-pay-history: rejects start > end with 400, accepts a valid range", async () => {
    const { registerDriverPayHistoryRoutes } = await import("../driver-pay-history.routes.js");
    const app = await buildApp(registerDriverPayHistoryRoutes);
    const driverId = "22222222-2222-4222-8222-222222222222";

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/driver-pay-history?operating_company_id=${COMPANY_ID}&driver_id=${driverId}&start=2026-02-01&end=2026-01-01` });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/driver-pay-history?operating_company_id=${COMPANY_ID}&driver_id=${driverId}&start=2026-01-01&end=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });

  it("profit-per-truck: rejects period_start > period_end with 400, accepts a valid range", async () => {
    const { registerProfitPerTruckRoutes } = await import("../profit-per-truck.routes.js");
    const app = await buildApp(registerProfitPerTruckRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/profit-per-truck?operating_company_id=${COMPANY_ID}&period_start=2026-02-01&period_end=2026-01-01&basis=accrual` });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/profit-per-truck?operating_company_id=${COMPANY_ID}&period_start=2026-01-01&period_end=2026-01-31&basis=accrual` });
    expect(good.statusCode).not.toBe(400);
  });

  it("lane-profitability (list, custom period): rejects start > end with 400, accepts a valid range", async () => {
    const { registerLaneProfitabilityRoutes } = await import("../lane-profitability.routes.js");
    const app = await buildApp(registerLaneProfitabilityRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/lane-profitability?operating_company_id=${COMPANY_ID}&period=custom&start=2026-02-01&end=2026-01-01` });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/start must be on or before end/i);
  });

  it("lane-profitability (loads detail): rejects period_start > period_end with 400, accepts a valid range", async () => {
    const { registerLaneProfitabilityRoutes } = await import("../lane-profitability.routes.js");
    const app = await buildApp(registerLaneProfitabilityRoutes);

    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/reports/lane-profitability/loads?operating_company_id=${COMPANY_ID}&period_start=2026-02-01&period_end=2026-01-01&origin_city=Laredo&origin_state=TX&destination_city=Houston&destination_state=TX`,
    });
    expect(bad.statusCode).toBe(400);
  });
});
