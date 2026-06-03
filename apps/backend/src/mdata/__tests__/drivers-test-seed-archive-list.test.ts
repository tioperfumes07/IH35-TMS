import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverRoutes } from "../drivers.routes.js";

const requireAuthState = { allowed: true };
const queryMock = vi.fn(async () => ({ rows: [] }));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../email/queue.service.js", () => ({
  enqueueEmail: vi.fn(),
}));

vi.mock("../driver-returning-detection.routes.js", () => ({
  findReturningDriverMatches: vi.fn(),
}));

describe("GET /api/v1/mdata/drivers test-seed archive filter", () => {
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
    await registerDriverRoutes(app);
    return app;
  }

  it("excludes archived test/seed drivers from default listings", async () => {
    const app = await buildApp("Dispatcher");
    const response = await app.inject({ method: "GET", url: "/api/v1/mdata/drivers" });

    expect(response.statusCode).toBe(200);
    const listSql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(listSql).toContain("archived_at IS NULL");
  });
});
