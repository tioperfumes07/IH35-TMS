import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0045-LATE-ARRIVAL-DATE-RANGE-ORDER-UNVALIDATED: same class as GO-0036 and 15+ other routes
// fixed this session -- a reversed from/to made the safety-relevant occurred_at range
// unsatisfiable, silently returning a false-clean "0 chronic" report on all 3 handlers instead of
// an error.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }) => {
    req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" };
    return true;
  },
}));

vi.mock("../late-arrival.service.js", () => ({
  aggregateLateArrivals: vi.fn().mockResolvedValue({ rows: [] }),
  getDriverLateArrivalDetail: vi.fn().mockResolvedValue({ entity_label: "x" }),
  getCustomerLateArrivalDetail: vi.fn().mockResolvedValue({ entity_label: "x" }),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const { registerLateArrivalAnalyticsRoutes } = await import("../late-arrival.routes.js");
  await app.register(registerLateArrivalAnalyticsRoutes);
  await app.ready();
  return app;
}

describe("late-arrival.routes.ts — date-range order validation (GO-0045)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("GET /late-arrivals rejects from > to with 400, accepts a valid range", async () => {
    app = await buildApp();
    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals?operating_company_id=${COMPANY_ID}&from=2026-02-01&to=2026-01-01&by=driver`,
    });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/from must be on or before to/i);

    const good = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals?operating_company_id=${COMPANY_ID}&from=2026-01-01&to=2026-01-31&by=driver`,
    });
    expect(good.statusCode).not.toBe(400);
  });

  it("GET /late-arrivals/driver/:uuid rejects from > to with 400, accepts a valid range", async () => {
    app = await buildApp();
    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals/driver/${ENTITY_ID}?operating_company_id=${COMPANY_ID}&from=2026-02-01&to=2026-01-01`,
    });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals/driver/${ENTITY_ID}?operating_company_id=${COMPANY_ID}&from=2026-01-01&to=2026-01-31`,
    });
    expect(good.statusCode).not.toBe(400);
  });

  it("GET /late-arrivals/customer/:uuid rejects from > to with 400, accepts a valid range", async () => {
    app = await buildApp();
    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals/customer/${ENTITY_ID}?operating_company_id=${COMPANY_ID}&from=2026-02-01&to=2026-01-01`,
    });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: "GET",
      url: `/api/v1/dispatch/analytics/late-arrivals/customer/${ENTITY_ID}?operating_company_id=${COMPANY_ID}&from=2026-01-01&to=2026-01-31`,
    });
    expect(good.statusCode).not.toBe(400);
  });
});
