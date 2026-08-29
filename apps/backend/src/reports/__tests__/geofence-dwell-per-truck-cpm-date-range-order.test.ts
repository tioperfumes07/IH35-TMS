import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0041-REPORTS-DATE-RANGE-ORDER-UNVALIDATED-ROUND-3: same class as GO-0036/GO-0037/GO-0039,
// two more previously-unaudited backend routes. A reversed period_start/period_end (or from/to)
// makes the SQL range predicate unsatisfiable, silently returning a legitimate 200 with an empty
// report -- indistinguishable from a genuine zero-activity period, no error signal.

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

describe("GO-0041 report date-range order validation, round 3", () => {
  it("geofence-dwell: rejects period_start > period_end with 400, accepts a valid range", async () => {
    const { registerGeofenceDwellRoutes } = await import("../geofence-dwell.routes.js");
    const app = await buildApp(registerGeofenceDwellRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/geofence-dwell?operating_company_id=${COMPANY_ID}&period_start=2026-02-01&period_end=2026-01-01` });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/period_start must be on or before period_end/i);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/geofence-dwell?operating_company_id=${COMPANY_ID}&period_start=2026-01-01&period_end=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });

  it("per-truck-cpm: rejects from > to with 400, accepts a valid range", async () => {
    const { registerPerTruckCpmRoutes } = await import("../per-truck-cpm/route.js");
    const app = await buildApp(registerPerTruckCpmRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/reports/per-truck-cpm?operating_company_id=${COMPANY_ID}&from=2026-02-01&to=2026-01-01` });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/from must be on or before to/i);

    const good = await app.inject({ method: "GET", url: `/api/v1/reports/per-truck-cpm?operating_company_id=${COMPANY_ID}&from=2026-01-01&to=2026-01-31` });
    expect(good.statusCode).not.toBe(400);
  });
});
