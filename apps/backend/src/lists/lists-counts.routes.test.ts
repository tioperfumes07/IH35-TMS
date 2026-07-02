import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LISTS_MODULE_KEYS } from "./lists-module-count-spec.js";
import { countModuleRecords, registerListsCountsRoutes } from "./lists-counts.routes.js";

// Cross-tenant guard: withCompanyScope now calls assertCompanyMembership(), which SELECTs from
// org.user_company_access. Simulate a seeded membership row (rowCount 1) for the authed test user;
// flip to false to exercise the cross-company rejection (403).
let isCompanyMember = true;
const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  if (sql.includes("user_company_access")) {
    return isCompanyMember ? { rows: [{ ok: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  return { rows: [{ count: 12 }] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("lists-counts routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    isCompanyMember = true;
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        role: "Owner",
      };
    });
    await registerListsCountsRoutes(app);
    return app;
  }

  for (const module of LISTS_MODULE_KEYS) {
    it(`GET /api/v1/lists/${module}/count returns live count`, async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/lists/${module}/count?operating_company_id=${companyId}`,
      });

      expect(response.statusCode).toBe(200);
      const expectedBase = module === "accounting" ? 15 : 12;
      expect(response.json()).toEqual({ count: expectedBase });
    });
  }

  it("cross-tenant authz: same-company caller (seeded membership) is allowed (200)", async () => {
    isCompanyMember = true;
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/dispatch/count?operating_company_id=${companyId}`,
    });
    expect(response.statusCode).toBe(200);
  });

  it("cross-tenant authz: cross-company caller (no membership) is rejected (403)", async () => {
    isCompanyMember = false;
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/dispatch/count?operating_company_id=${companyId}`,
    });
    expect(response.statusCode).toBe(403);
  });

  it("countModuleRecords returns 0 for names_master with no tables", async () => {
    queryMock.mockImplementationOnce(async () => ({ rows: [{ count: 0 }] }));
    const count = await countModuleRecords({ query: queryMock }, "names_master", companyId);
    expect(count).toBe(0);
  });
});
