import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverScoringRoutes } from "../driver-scoring.routes.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockAssertMembership } = vi.hoisted(() => {
  const query = vi.fn(async () => ({ rows: [] }));
  const assertCompanyMembership = vi.fn(async () => undefined);
  return { mockQuery: query, mockAssertMembership: assertCompanyMembership };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery })
  ),
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: mockAssertMembership,
}));

describe("legacy driver scoring routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockClear();
    mockAssertMembership.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: USER, role: "Safety", email: "safety@ih35.local" };
    });
    await registerDriverScoringRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("uses canonical active-driver predicates and same-company joins", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/driver-scoring?operating_company_id=${COMPANY}&period_days=30`,
    });

    expect(res.statusCode).toBe(200);
    expect(mockAssertMembership).toHaveBeenCalledWith(expect.objectContaining({ query: mockQuery }), USER, COMPANY);
    const sql = mockQuery.mock.calls.map((call) => String(call[0])).find((value) => value.includes("WITH current_window"));
    expect(sql).toContain("event_driver.operating_company_id = e.operating_company_id");
    expect(sql).toContain("BTRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS driver_name");
    expect(sql).toContain("d.status = 'Active'::mdata.driver_status");
    expect(sql).toContain("d.deactivated_at IS NULL");
    expect(sql).toContain("d.archived_at IS NULL");
    expect(sql).not.toContain("d.active");
  });

  it("tenant-binds event history without erasing inactive drivers", async () => {
    const driver = "22222222-2222-4222-8222-222222222222";
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT 1 FROM mdata.drivers d")) return { rows: [{ exists: 1 }] };
      if (sql.includes("COUNT(*)::int AS total_count")) return { rows: [{ total_count: 0 }] };
      return { rows: [] };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/driver-scoring/${driver}/events?operating_company_id=${COMPANY}&period_days=30`,
    });

    expect(res.statusCode).toBe(200);
    const sql = mockQuery.mock.calls
      .map((call) => String(call[0]))
      .find((value) => value.includes("SELECT\n            e.id::text") && value.includes("FROM safety.harsh_events e"));
    expect(sql).toContain("d.operating_company_id = e.operating_company_id");
    expect(sql).toContain("label_dca.company_id = e.operating_company_id");
    expect(sql).toContain("label_dca.is_authorized = true");
    expect(sql).toContain("label_dca.deactivated_at IS NULL");
    expect(sql).toContain("e.operating_company_id = $1::uuid");
    expect(sql).not.toContain("d.status = 'Active'::mdata.driver_status");
    expect(sql).not.toContain("d.deactivated_at IS NULL");
    expect(sql).not.toContain("d.archived_at IS NULL");
  });
});
