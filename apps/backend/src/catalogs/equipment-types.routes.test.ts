import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerEquipmentTypeRoutes } from "./equipment-types.routes.js";

const dryVanCanonicalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
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
});
