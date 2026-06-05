import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTirePositionsCatalogRoutes } from "./tire-positions.routes.js";

const mockQuery = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn(() => true);

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

describe("tire-positions catalog routes (AUDIT-FIX-9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('catalogs.tire_positions')")) return { rows: [{ ok: true }] };
      if (sql.includes("count(*)")) return { rows: [{ total: "2" }] };
      return {
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            code: "LF",
            display_name: "Left Front",
            description: null,
            metadata: {},
            is_active: true,
            sort_order: 10,
            created_at: "2026-06-04T12:00:00.000Z",
            updated_at: "2026-06-04T12:00:00.000Z",
          },
        ],
      };
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerTirePositionsCatalogRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts is_active=true&limit=500 without 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/catalogs/fleet/tire-positions?is_active=true&limit=500",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; total: number };
    expect(body.rows).toHaveLength(1);
    expect(body.total).toBe(2);
  });

  it("rejects limit above 500 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/catalogs/fleet/tire-positions?is_active=true&limit=501",
    });
    expect(res.statusCode).toBe(400);
  });
});
