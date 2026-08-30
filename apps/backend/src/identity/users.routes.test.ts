import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIdentityRoutes } from "./users.routes.js";

const requireAuthState = { allowed: true };

// USERS-LIST-SILENT-50-CAP: total defaults to the same 1-row count as the users mock below, so
// existing tests (which never asserted on total_count) still see a consistent
// total_count === users.length shape. Tests exercising the truncation case override this.
const totalCountMockState = { total: "1" };

// USER-VERIFY-01 (runtime evidence for the PATCH role-change gate, users.routes.ts:596-624):
// mutable per-test state since queryMock only sees the SQL string, not bind params — each
// PATCH test sets exactly the "old row" / owner-count / "updated row" this test case needs.
const patchOldRowMockState: { row: Record<string, unknown> | null } = { row: null };
const ownersCountMockState = { n: "1" };
const patchUpdatedRowMockState: { row: Record<string, unknown> | null } = { row: null };

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
  // PATCH's "owners remaining" check runs before the PATCH old-row select's substring would
  // ever match it (distinct text: "count(*)::text AS n"), so order doesn't matter here.
  if (sql.includes("count(*)::text AS n FROM identity.users")) {
    return { rows: [{ n: ownersCountMockState.n }] };
  }
  if (sql.includes("UPDATE identity.users") && sql.includes("SET role = $1")) {
    return { rows: patchUpdatedRowMockState.row ? [patchUpdatedRowMockState.row] : [] };
  }
  // PATCH's "old row" select (users.routes.ts:585) shares its column list with the GET
  // detail route's select — not called by any test below, so the substring is unambiguous here.
  if (
    sql.includes("password_hash, default_company_id, created_at, deactivated_at") &&
    sql.includes("FROM identity.users") &&
    sql.includes("LIMIT 1")
  ) {
    return { rows: patchOldRowMockState.row ? [patchOldRowMockState.row] : [] };
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
    patchOldRowMockState.row = null;
    ownersCountMockState.n = "1";
    patchUpdatedRowMockState.row = null;
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

  // USER-VERIFY-01: replaces the manual "sign in as a non-Owner test user, attempt Change-Role,
  // capture the rejection" walk (impossible for this agent to perform — creating an account and
  // entering a password to authenticate are both prohibited regardless of authorization) with
  // runtime tests against the actual gate, PATCH /api/v1/identity/users/:id (users.routes.ts:596-624).
  // Every assertion below is written from the gate's own DOCUMENTED RULE (the source comment at
  // ~:596-598 — G1-1 anti-escalation, audit 2026-07-04), not copied from reading what the
  // implementation currently does — a test built from the implementation would pass even if the
  // implementation were wrong. If any case here disagrees with the live code, that is a finding,
  // not a bug in the test.
  describe("PATCH /api/v1/identity/users/:id role-change gate (G1-1 anti-escalation)", () => {
    const SELF_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // matches buildApp()'s fixed authUser.uuid
    const OTHER_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const OTHER_OWNER_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    function baseRow(overrides: Record<string, unknown>) {
      return {
        id: null,
        email: "target@example.com",
        role: null,
        first_name: "Target",
        last_name: "User",
        google_user_id: null,
        password_hash: "argon2id$fake",
        default_company_id: null,
        created_at: "2026-06-01T12:00:00.000Z",
        deactivated_at: null,
        ...overrides,
      };
    }

    // Rule: only an Owner/Administrator may reach the role-change logic at all (isAdminRole gate,
    // shared with every other mutation on this resource). A non-admin role must be rejected before
    // any row is even read — proven here by never seeding patchOldRowMockState.
    it("a) a non-admin role (Dispatcher) attempting any role change is rejected outright — 403, no row read", async () => {
      const app = await buildApp("Dispatcher");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/identity/users/${OTHER_UUID}`,
        payload: { role: "Manager" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "forbidden" });
    });

    // Rule: only an Owner may grant the Owner role or re-role an existing Owner.
    it("b) an Administrator attempting to grant role=Owner is denied — only an Owner may", async () => {
      patchOldRowMockState.row = baseRow({ id: OTHER_UUID, role: "Manager" });
      const app = await buildApp("Administrator");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/identity/users/${OTHER_UUID}`,
        payload: { role: "Owner" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "owner_role_requires_owner" });
    });

    // Rule: no one may change their OWN role — proven for an Administrator acting on themselves
    // (not the Owner-role path above, so this exercises the second guard independently).
    it("c) an Administrator attempting to change their OWN role is denied", async () => {
      patchOldRowMockState.row = baseRow({ id: SELF_UUID, role: "Administrator" });
      const app = await buildApp("Administrator");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/identity/users/${SELF_UUID}`,
        payload: { role: "Manager" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "cannot_change_own_role" });
    });

    // Rule: never demote the last active Owner. An Owner CAN demote another Owner in general
    // (proven distinct from case (e)'s success path), but not when it would leave zero active
    // Owners — proven by mocking the "other active owners" count at exactly 0.
    it("d) an Owner demoting the last other active Owner is denied", async () => {
      patchOldRowMockState.row = baseRow({ id: OTHER_OWNER_UUID, role: "Owner" });
      ownersCountMockState.n = "0";
      const app = await buildApp("Owner");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/identity/users/${OTHER_OWNER_UUID}`,
        payload: { role: "Manager" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "cannot_demote_last_owner" });
    });

    // The gate must be a gate, not a wall: a legitimate role change by an Owner, on someone else,
    // not involving the Owner role at all, must SUCCEED. A suite that only ever expects 403 would
    // also pass against a route that rejects everything, proving nothing about the actual gate.
    it("e) an Owner performing a legitimate role change on someone else succeeds — 200", async () => {
      patchOldRowMockState.row = baseRow({ id: OTHER_UUID, role: "Dispatcher" });
      patchUpdatedRowMockState.row = baseRow({ id: OTHER_UUID, role: "Manager" });
      const app = await buildApp("Owner");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/identity/users/${OTHER_UUID}`,
        payload: { role: "Manager" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: OTHER_UUID, role: "Manager" });
    });
  });
});
