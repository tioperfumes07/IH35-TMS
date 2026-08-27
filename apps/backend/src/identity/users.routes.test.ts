import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIdentityRoutes } from "./users.routes.js";

const requireAuthState = { allowed: true };

// USERS-LIST-SILENT-50-CAP: total defaults to the same 1-row count as the users mock below, so
// existing tests (which never asserted on total_count) still see a consistent
// total_count === users.length shape. Tests exercising the truncation case override this.
const totalCountMockState = { total: "1" };

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
  if (sql.includes("count(*)::text AS total FROM identity.users")) {
    return { rows: [{ total: totalCountMockState.total }] };
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
    totalCountMockState.total = "1";
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

  // USERS-LIST-SILENT-50-CAP: the response used to return only `{ users }` — the caller had no
  // way to know it was looking at one page of a bigger roster. A COUNT(*) over the identical
  // WHERE clause now rides alongside the paginated SELECT.
  it("GET /api/v1/identity/users includes total_count matching the actual row count", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    const body = response.json() as { users: unknown[]; total_count: number };
    expect(body.total_count).toBe(1);
    expect(body.total_count).toBe(body.users.length);
  });

  it("GET /api/v1/identity/users' total_count reflects the FULL roster even when the page is smaller (the exact truncation case)", async () => {
    totalCountMockState.total = "347";
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    const body = response.json() as { users: unknown[]; total_count: number };
    expect(body.total_count).toBe(347);
    expect(body.users.length).toBe(1); // the mocked page — the caller can now tell it's truncated
    expect(body.total_count).not.toBe(body.users.length);
  });

  // USERS-2: the full directory (email, auth method, last-login) is a user-management surface — only
  // Owner/Administrator may read it. A low-privilege role must NOT be able to enumerate every user.
  it("GET /api/v1/identity/users returns 200 for Administrator", async () => {
    const app = await buildApp("Administrator");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    expect(response.statusCode).toBe(200);
  });

  it("GET /api/v1/identity/users returns 403 for a non-admin role (Dispatcher)", async () => {
    const app = await buildApp("Dispatcher");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("GET /api/v1/identity/users returns 403 for a Driver (no directory enumeration)", async () => {
    const app = await buildApp("Driver");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users" });
    expect(response.statusCode).toBe(403);
  });

  // USERS-2: assignee pickers need a minimal name/role list — allowed for every office role, but NEVER
  // exposes the auth-sensitive fields the full directory does, and is closed to Driver.
  it("GET /api/v1/identity/users/assignable returns 200 for a non-admin office role (Dispatcher)", async () => {
    const app = await buildApp("Dispatcher");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users/assignable" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("users");
  });

  it("GET /api/v1/identity/users/assignable returns 200 for Owner", async () => {
    const app = await buildApp("Owner");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users/assignable" });
    expect(response.statusCode).toBe(200);
  });

  it("GET /api/v1/identity/users/assignable returns 403 for a Driver", async () => {
    const app = await buildApp("Driver");
    const response = await app.inject({ method: "GET", url: "/api/v1/identity/users/assignable" });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });
});
