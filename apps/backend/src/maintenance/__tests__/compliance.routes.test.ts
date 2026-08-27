import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceComplianceRoutes } from "../compliance.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(async (_id: string, fn: (client: { query: typeof mockQuery }) => unknown) => fn({ query: mockQuery })) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));

describe("maintenance compliance 425C route", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => { req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Manager", email: "maint@ih35.local" }; });
    await registerMaintenanceComplianceRoutes(app);
    await app.ready();
  });
  afterEach(async () => app.close());

  it("returns an exact company-scoped range", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("COUNT(*)::int AS total_count")) return { rows: [{ total_count: 212 }] };
      expect(values).toEqual([COMPANY, 25, 50]);
      return { rows: [{ id: "event-1", event_type: "maintenance.compliance", created_at: "2026-08-27T10:00:00Z", payload: { operating_company_id: COMPANY } }] };
    });
    const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/compliance/425c-log?operating_company_id=${COMPANY}&limit=25&offset=50` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total_count: 212, rows: [{ id: "event-1" }] });
  });
});
