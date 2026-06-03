import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTelematicsPositionsRoutes } from "./positions.routes.js";

const requireAuthState = { allowed: true };
const executedSql: string[] = [];
const queryParams: unknown[][] = [];

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  executedSql.push(sql);
  if (values) queryParams.push(values);
  if (sql.includes("set_config('app.operating_company_id'")) {
    return { rows: [] };
  }
  if (sql.includes("FROM telematics.vehicle_latest_position p")) {
    return {
      rows: [
        {
          unit_id: "22222222-2222-4222-8222-222222222222",
          unit_number: "U-201",
          samsara_vehicle_id: "veh_201",
          captured_at: "2026-05-31T12:00:00.000Z",
          lat: 30.2672,
          lng: -97.7431,
          speed_mph: 45,
          heading_deg: 180,
          engine_state: "on",
        },
      ],
    };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("telematics positions routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    executedSql.length = 0;
    queryParams.length = 0;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Dispatcher") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerTelematicsPositionsRoutes(app);
    return app;
  }

  it("GET /api/v1/telematics/positions/latest with operating_company_id avoids invalid units column references", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/telematics/positions/latest?operating_company_id=11111111-1111-4111-8111-111111111111",
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(500);

    const body = response.json() as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBe(1);

    const latestSql = executedSql.find((sql) => sql.includes("FROM telematics.vehicle_latest_position p"));
    expect(latestSql).toBeDefined();
    expect(latestSql).toContain("COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = p.operating_company_id");
    expect(latestSql).toContain("u.deactivated_at IS NULL");
    expect(latestSql).toContain("p.captured_at > now() - interval '24 hours'");
    expect(latestSql).not.toContain("u.operating_company_id = p.operating_company_id");
  });

  it("scopes latest positions to the requested operating_company_id under withCurrentUser", async () => {
    const tenantA = "11111111-1111-4111-8111-111111111111";
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/telematics/positions/latest?operating_company_id=${tenantA}`,
    });

    expect(response.statusCode).toBe(200);
    expect(queryParams.some((values) => values?.[0] === tenantA)).toBe(true);
    const latestSql = executedSql.find((sql) => sql.includes("FROM telematics.vehicle_latest_position p"));
    expect(latestSql).toContain("WHERE p.operating_company_id = $1::uuid");
  });

  it("returns one row per unit from the latest-position view contract", async () => {
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      executedSql.push(sql);
      if (values) queryParams.push(values);
      if (sql.includes("FROM telematics.vehicle_latest_position p")) {
        return {
          rows: [
            {
              unit_id: "22222222-2222-4222-8222-222222222222",
              unit_number: "U-201",
              samsara_vehicle_id: "veh_201",
              captured_at: "2026-05-31T12:00:00.000Z",
              lat: 30.2672,
              lng: -97.7431,
              speed_mph: 45,
              heading_deg: 180,
              engine_state: "on",
            },
            {
              unit_id: "33333333-3333-4333-8333-333333333333",
              unit_number: "U-202",
              samsara_vehicle_id: "veh_202",
              captured_at: "2026-05-30T12:00:00.000Z",
              lat: 29.1,
              lng: -98.2,
              speed_mph: 0,
              heading_deg: 90,
              engine_state: "off",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/telematics/positions/latest?operating_company_id=11111111-1111-4111-8111-111111111111",
    });

    const body = response.json() as { rows: Array<{ unit_id: string }> };
    const unitIds = body.rows.map((row) => row.unit_id);
    expect(new Set(unitIds).size).toBe(unitIds.length);
  });
});
