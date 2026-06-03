import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVERS_CATALOG_CONFIGS } from "../drivers-catalogs.shared.js";
import { registerDriversCatalogsRoutes } from "../drivers-catalogs.routes.js";

const createdId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let store: Record<string, unknown> | null = null;

const queryMock = vi.fn(async (sql: string, values: unknown[] = []) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  if (sql.includes("INSERT INTO reference.")) {
    store = {
      id: createdId,
      code: values[0],
      label: values[1],
      sort_order: values[2],
      archived_at: null,
      created_at: "2026-06-03T00:00:00.000Z",
      updated_at: "2026-06-03T00:00:00.000Z",
    };
    return { rows: [store] };
  }
  if (sql.includes("SELECT id") && sql.includes("archived_at IS NULL")) {
    return { rows: store ? [] : [] };
  }
  if (sql.includes("count(*)")) {
    return { rows: [{ total_count: store && !store.archived_at ? "1" : "0", archived_count: store?.archived_at ? "1" : "0" }] };
  }
  if (sql.includes("UPDATE reference.") && sql.includes("archived_at")) {
    if (!store || values[0] !== createdId) return { rows: [] };
    store = { ...store, archived_at: values[1] ? "2026-06-03T01:00:00.000Z" : null };
    return { rows: [store] };
  }
  if (sql.includes("FROM reference.") && sql.includes("ORDER BY")) {
    const rows = store && !sql.includes("archived_at IS NULL") ? [store] : store && !store.archived_at ? [store] : [];
    return { rows };
  }
  return { rows: [] };
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

describe("drivers catalog CRUD round-trip", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    store = null;
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
    it(`${config.urlSegment}: create → read → archive`, async () => {
      const app = await buildApp();
      const base = `/api/v1/lists/drivers/${config.urlSegment}`;

      const createRes = await app.inject({
        method: "POST",
        url: base,
        payload: { code: "TST", label: "Test row", sort_order: 99 },
      });
      expect(createRes.statusCode).toBe(201);

      const readRes = await app.inject({ method: "GET", url: base });
      expect(readRes.statusCode).toBe(200);
      expect(readRes.json().rows[0]?.code).toBe("TST");

      const archiveRes = await app.inject({
        method: "PATCH",
        url: `${base}/${createdId}`,
        payload: { archived: true },
      });
      expect(archiveRes.statusCode).toBe(200);
      expect(archiveRes.json().archived_at).toBeTruthy();
    });
  }
});
