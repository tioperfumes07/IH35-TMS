import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVER_SUBCATALOG_CONFIGS } from "../../catalogs/driver/subcatalog-config.js";
import { registerDriverCatalogDeprecatedRoutes } from "../driver-catalogs.routes.js";

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

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

describe("deprecated catalogs.driver factory routes (A17.2)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    warnSpy.mockClear();
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
    await registerDriverCatalogDeprecatedRoutes(app);
    return app;
  }

  it("GET /api/v1/catalogs/driver/license-classes returns Deprecation + Sunset headers", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/catalogs/driver/license-classes?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe("true");
    expect(response.headers.sunset).toBe("Wed, 03 Sep 2026 00:00:00 GMT");
    expect(String(response.headers.link)).toContain("/api/v1/lists/drivers/license-classes");
  });

  it("emits console.warn on factory route call", async () => {
    const app = await buildApp();
    const config = DRIVER_SUBCATALOG_CONFIGS[0];
    await app.inject({
      method: "GET",
      url: `/api/v1/catalogs/driver/${config.urlSegment}?operating_company_id=${companyId}`,
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("[DEPRECATED]");
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(`/lists/drivers/${config.successorListsSegment}`);
  });
});
