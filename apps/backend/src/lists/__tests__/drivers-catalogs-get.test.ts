import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVERS_CATALOG_CONFIGS } from "../drivers-catalogs.shared.js";
import { registerDriversCatalogsRoutes } from "../drivers-catalogs.routes.js";

const sampleRow = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  code: "A",
  label: "Class A",
  sort_order: 10,
  archived_at: null,
  created_at: "2026-06-03T00:00:00.000Z",
  updated_at: "2026-06-03T00:00:00.000Z",
};

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  if (sql.includes("count(*)")) {
    return { rows: [{ total_count: "1", archived_count: "0" }] };
  }
  return { rows: [sampleRow] };
});

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("GET /api/v1/lists/drivers/* catalog endpoints", () => {
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
    await registerDriversCatalogsRoutes(app);
    return app;
  }

  for (const config of DRIVERS_CATALOG_CONFIGS) {
    it(`GET /api/v1/lists/drivers/${config.urlSegment} returns rows payload`, async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/lists/drivers/${config.urlSegment}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        rows: [sampleRow],
        total_count: 1,
        archived_count: 0,
      });
    });
  }
});
