import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerEquipmentTypeRoutes } from "./equipment-types.routes.js";

const dryVanCanonicalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  // Per-entity scoping resolves the caller's company before the collision check; give the Owner mock
  // a company so the test drives the real 409 path instead of the 403 no-company refusal.
  if (sql.includes("user_accessible_company_ids") || sql.includes("default_company_id")) {
    return { rows: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] };
  }
  if (sql.includes("set_config('app.operating_company_id'")) {
    return { rows: [] };
  }
  if (sql.includes("FROM catalogs.equipment_types et") && sql.includes("regexp_replace")) {
    const normalizedCode = String(values?.[0] ?? "");
    if (normalizedCode === "dry-van") {
      return { rows: [{ id: dryVanCanonicalId }] };
    }
    return { rows: [] };
  }

  if (sql.includes("INSERT INTO catalogs.equipment_types")) {
    return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
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

describe("equipment-types routes", () => {
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
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    await registerEquipmentTypeRoutes(app);
    return app;
  }

  it("POST DRY_VAN returns 409 when normalized name collides with Dry Van", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/catalogs/equipment-types",
      payload: {
        code: "DRY_VAN",
        name: "Dry Van",
        sort_order: 100,
        line_items: [
          {
            code: "LOADED_MILE",
            name: "Loaded mile rate",
            unit: "per_loaded_mile",
            sort_order: 10,
            is_required: true,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "equipment_type_name_collision" });
  });

  it("GET explicitly binds the requested company on parent and child catalog reads", async () => {
    const app = await buildApp();
    const companyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/catalogs/equipment-types?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(([sql]) =>
      sql.includes("json_agg") && sql.includes("FROM catalogs.equipment_types et")
    );
    expect(listCall).toBeDefined();
    expect(listCall?.[0]).toContain("WHERE et.operating_company_id = $1");
    expect(listCall?.[0]).toContain("lit.operating_company_id = $1");
    expect(listCall?.[1]).toEqual([companyId]);
  });
});
