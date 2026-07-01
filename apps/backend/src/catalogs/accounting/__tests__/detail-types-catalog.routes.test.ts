import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDetailTypesCatalogRoutes } from "../detail-types-catalog.routes.js";

const queryMock = vi.fn();

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

const OPCO = "7bb8dfad-cb91-4f2f-a36d-7c82d28b89e7";
const DTID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("detail-types catalog route (Block 4)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
    queryMock.mockReset();
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = { uuid: "11111111-1111-4111-8111-111111111111", role };
    });
    registerDetailTypesCatalogRoutes(app);
    await app.ready();
    return app;
  }

  it("creates a per-entity custom detail type (201, is_system forced false)", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO catalogs.detail_types")) return { rows: [{ id: "new-dt" }] };
      return { rows: [] };
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/accounting/detail-types?operating_company_id=${OPCO}`,
      payload: { account_type_id: ATID, name: "Fuel Surcharge Detail" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ id: string }>().id).toBe("new-dt");
    const insert = queryMock.mock.calls.find(([s]) => String(s).includes("INSERT INTO catalogs.detail_types"));
    expect(String(insert?.[0])).toContain("false)"); // is_system literal false
  });

  it("rejects editing a system (seed-locked) detail type with 409", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT is_system")) return { rows: [{ is_system: true }] };
      return { rows: [] };
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/catalogs/accounting/detail-types/${DTID}?operating_company_id=${OPCO}`,
      payload: { name: "hack" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe("detail_type_is_system");
  });

  it("forbids writes from a non-catalog-write role (403)", async () => {
    const app = await buildApp("Driver");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/accounting/detail-types?operating_company_id=${OPCO}`,
      payload: { account_type_id: ATID, name: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("requires operating_company_id (400)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/catalogs/accounting/detail-types" });
    expect(res.statusCode).toBe(400);
  });
});
