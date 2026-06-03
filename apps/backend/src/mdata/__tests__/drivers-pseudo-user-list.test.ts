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

describe("GET /api/v1/mdata/drivers pseudo-user listing", () => {
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

  it("excludes system pseudo-users from default driver listings", async () => {
    const app = await buildApp("Dispatcher");
    const response = await app.inject({ method: "GET", url: "/api/v1/mdata/drivers" });

    expect(response.statusCode).toBe(200);
    const listSql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(listSql).toContain("Safety Safety");
    expect(listSql).toContain("NOT IN ('safety', 'system')");
  });

  it("returns pseudo-users when include_system=true for administrators", async () => {
    const app = await buildApp("Administrator");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/mdata/drivers?include_system=true",
    });

    expect(response.statusCode).toBe(200);
    const listSql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(listSql).not.toContain("Safety Safety");
  });

  it("rejects include_system for non-admin roles", async () => {
    const app = await buildApp("Dispatcher");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/mdata/drivers?include_system=true",
    });

    expect(response.statusCode).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
