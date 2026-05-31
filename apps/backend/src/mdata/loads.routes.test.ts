import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadRoutes } from "./loads.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("COUNT(*)::int AS total_count")) {
    return { rows: [{ total_count: 0 }] };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("mdata loads routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Dispatcher") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerLoadRoutes(app);
    return app;
  }

  it("GET /api/v1/mdata/loads accepts empty driver UUID filter as unset", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/mdata/loads?operating_company_id=11111111-1111-4111-8111-111111111111&driver_id=",
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(500);
    expect(response.json()).toMatchObject({
      loads: [],
    });
  });
});
