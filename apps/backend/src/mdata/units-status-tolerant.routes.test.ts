import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerUnitsRoutes } from "./units.routes.js";

// CODER-17 hardening regression: GET /api/v1/mdata/units?status=Active must NOT 400.
// "Active" is not a fleet-status enum value (valid = InService, etc.); the expenses unit-picker
// sends it. The status filter now `.catch`-degrades an unrecognized value to no filter, so the
// list returns active units (deactivated_at IS NULL default) with 200 instead of validation 400.

const requireAuthState = { allowed: true };

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async (sql: string) => {
    if (/count/i.test(sql)) return { rows: [{ total_count: 0, count: 0 }] };
    return { rows: [] };
  }),
}));

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
  pool: { query: queryMock },
  query: queryMock,
}));

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  requireAuthState.allowed = true;
});

describe("mdata units list — status tolerance (CODER-17)", () => {
  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Owner",
      };
    });
    await registerUnitsRoutes(app);
    return app;
  }

  it("degrades an unrecognized status filter to 200 (no 400)", async () => {
    const app = await buildApp();
    for (const status of ["Active", "totally_bogus"]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/mdata/units?operating_company_id=11111111-1111-4111-8111-111111111111&status=${encodeURIComponent(status)}`,
      });
      expect(res.statusCode, `status=${status}`).toBe(200);
      expect(res.statusCode).not.toBe(400);
    }
  });
});
