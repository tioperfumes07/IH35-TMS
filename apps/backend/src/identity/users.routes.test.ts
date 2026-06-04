import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIdentityRoutes } from "./users.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("last_login_at::text AS last_login_at")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "new.user@example.com",
          role: "Dispatcher",
          first_name: "New",
          last_name: "User",
          google_user_id: null,
          password_hash: null,
          default_company_id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-06-01T12:00:00.000Z",
          deactivated_at: null,
          last_login_at: null,
        },
      ],
    };
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

describe("identity users routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerIdentityRoutes(app);
    return app;
  }

  it("GET /api/v1/identity/users returns 200 for authenticated Owner", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    expect(response.statusCode).toBe(200);
  });

  it("GET /api/v1/identity/users includes last_login_at on each user", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    const body = response.json() as { users: Array<{ last_login_at: string | null }> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toHaveProperty("last_login_at");
  });

  it("GET /api/v1/identity/users returns null last_login_at for users who never logged in", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    const body = response.json() as { users: Array<{ last_login_at: string | null }> };
    expect(body.users[0]?.last_login_at).toBeNull();
  });
});
