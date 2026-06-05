import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeHeaderKey, parseSpreadsheetRows } from "./excel-uploader.js";
import { registerGenericCatalogRoutes } from "./generic-catalog.routes.js";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("count(*)::text AS total") && sql.includes("catalogs.equipment_types")) {
    return { rows: [{ total: "1" }] };
  }
  if (sql.includes("FROM catalogs.equipment_types")) {
    return {
      rows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          code: "DRY_VAN",
          name: "Dry Van",
          description: null,
          sort_order: 100,
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
  }
  if (sql.includes("INSERT INTO catalogs.excel_upload_jobs")) {
    return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
  }
  if (sql.includes("FROM catalogs.excel_upload_jobs")) {
    return {
      rows: [
        {
          id: values?.[0],
          catalog_name: "fleet.equipment_types",
          status: "completed",
          rows_total: 1,
          rows_succeeded: 1,
          rows_failed: 0,
          error_log: [],
        },
      ],
    };
  }
  if (sql.includes("UPDATE catalogs.excel_upload_jobs")) {
    return { rows: [] };
  }
  if (sql.includes("INSERT INTO catalogs.equipment_types")) {
    return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

describe("generic catalog framework", () => {
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
        uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        role: "Owner",
      };
    });
    await registerGenericCatalogRoutes(app);
    return app;
  }

  it("lists fleet equipment types via generic factory", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/catalogs/fleet/equipment-types",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      catalog_name: "fleet.equipment_types",
      total: 1,
    });
  });

  it("normalizes spreadsheet headers for import mapping", () => {
    expect(normalizeHeaderKey("Sort Order")).toBe("sort_order");
    const rows = parseSpreadsheetRows(Buffer.from("code,name\nDRY_VAN,Dry Van\n"), "sample.csv");
    expect(rows).toEqual([{ code: "DRY_VAN", name: "Dry Van" }]);
  });

  it("returns excel upload job status", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/catalogs/excel-upload-jobs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      catalog_name: "fleet.equipment_types",
      status: "completed",
    });
  });
});
