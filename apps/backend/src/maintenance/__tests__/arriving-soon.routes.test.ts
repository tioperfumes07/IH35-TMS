import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceArrivingSoonRoutes } from "../arriving-soon.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(async (_id: string, fn: (client: { query: typeof mockQuery }) => unknown) => fn({ query: mockQuery })) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

describe("maintenance arriving-soon route", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => { req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Manager", email: "maint@ih35.local" }; });
    await registerMaintenanceArrivingSoonRoutes(app);
    await app.ready();
  });
  afterEach(async () => app.close());

  it("returns a deterministic page and exact full-filter counts", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("COUNT(*)::int AS total")) {
        expect(values).toEqual([COMPANY, 48]);
        return { rows: [{ total: 326, severe: 12, warning: 44, info: 270, already_arrived: 3, within_24h: 81, within_48h: 190 }] };
      }
      if (sql.includes("FROM maintenance.v_arriving_soon")) {
        expect(values).toEqual([COMPANY, 48, 25, 50]);
        expect(sql).toContain("load_id ASC");
        expect(sql).toContain("unit_id ASC");
        return { rows: [{ load_id: "load-1", unit_id: "unit-1", issues_json: [], severe_count: 0, warning_count: 1, info_count: 0 }] };
      }
      if (sql.includes("FROM dispatch.intransit_issues")) return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/arriving-soon?operating_company_id=${COMPANY}&limit=25&offset=50` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ counts: { total: 326, warning: 44 }, cards: [{ load_id: "load-1" }] });
  });
});
