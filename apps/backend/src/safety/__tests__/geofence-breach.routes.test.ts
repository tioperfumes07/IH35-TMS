import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGeofenceBreachRoutes } from "../geofence-breach.routes.js";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

// Cross-tenant guard: exercised in dedicated membership tests; here it is a no-op so route logic (not membership) is under test.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("geofence breach routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerGeofenceBreachRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("keeps company isolation on list query", async () => {
    mockQuery.mockImplementation(async (_sql: string, values?: unknown[]) => {
      const company = String(values?.[0] ?? "");
      if (company === "11111111-1111-4111-8111-111111111111") {
        return {
          rows: [
            {
              id: "evt-a",
              operating_company_id: company,
              vehicle_id: "22222222-2222-2222-2222-222222222222",
              unit_number: "U-22",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const resCompanyA = await app.inject({
      method: "GET",
      url: "/api/v1/safety/geofence-breaches?operating_company_id=11111111-1111-4111-8111-111111111111",
    });
    expect(resCompanyA.statusCode).toBe(200);
    expect(resCompanyA.json().events).toHaveLength(1);

    const resCompanyB = await app.inject({
      method: "GET",
      url: "/api/v1/safety/geofence-breaches?operating_company_id=33333333-3333-4333-8333-333333333333",
    });
    expect(resCompanyB.statusCode).toBe(200);
    expect(resCompanyB.json().events).toEqual([]);
  });

  it("returns exact range metadata and a bounded page", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("COUNT(*) FILTER")) {
        expect(values?.[3]).toBe("active");
        return { rows: [{ total_count: 1205, active_count: 1205, active_vehicle_ids: ["unit-a", "unit-b"] }] };
      }
      if (sql.includes("FROM safety.geofence_breach_events e")) {
        expect(values?.slice(3)).toEqual([50, 1000]);
        return { rows: [{ id: "evt-1001", vehicle_id: "unit-a" }] };
      }
      return { rows: [] };
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/safety/geofence-breaches?operating_company_id=11111111-1111-4111-8111-111111111111&filter=active&page_size=50&offset=1000",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [{ id: "evt-1001" }],
      total_count: 1205,
      active_count: 1205,
      active_vehicle_ids: ["unit-a", "unit-b"],
      page_size: 50,
      offset: 1000,
    });
  });

  it("acknowledges event for matching tenant", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: "evt-a",
          operating_company_id: "11111111-1111-4111-8111-111111111111",
          acknowledged_at: "2026-05-24T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/geofence-breaches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/acknowledge",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "evt-a",
      operating_company_id: "11111111-1111-4111-8111-111111111111",
    });
  });
});
