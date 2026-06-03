import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDriverCatalogRoutes } from "../index.js";
import { DRIVER_SUBCATALOG_CONFIGS } from "../subcatalog-config.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const sampleRow = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  operating_company_id: companyId,
  code: "A",
  display_name: "Class A",
  description: null,
  metadata: {},
  is_active: true,
  sort_order: 10,
  created_at: "2026-06-03T00:00:00.000Z",
  updated_at: "2026-06-03T00:00:00.000Z",
};

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  if (sql.includes("count(*)")) return { rows: [{ total: "1" }] };
  if (sql.includes("INSERT INTO catalogs.")) return { rows: [sampleRow] };
  return { rows: [sampleRow] };
});

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

describe("driver sub-catalog factory routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
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
    await registerDriverCatalogRoutes(app);
    return app;
  }

  for (const config of DRIVER_SUBCATALOG_CONFIGS) {
    it(`GET /api/v1/catalogs/driver/${config.urlSegment} returns factory rows payload`, async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/catalogs/driver/${config.urlSegment}?operating_company_id=${companyId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ rows: [sampleRow], total: 1 });
    });
  }
});
