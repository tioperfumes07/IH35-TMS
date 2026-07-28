import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LISTS_MODULE_KEYS } from "./lists-module-count-spec.js";
import { countModuleRecords, registerListsCountsRoutes } from "./lists-counts.routes.js";

// Cross-tenant guard: withCompanyScope now calls assertCompanyMembership(), which SELECTs from
// org.user_company_access. Simulate a seeded membership row (rowCount 1) for the authed test user;
// flip to false to exercise the cross-company rejection (403).
let isCompanyMember = true;
const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  if (sql.includes("user_company_access")) {
    return isCompanyMember ? { rows: [{ ok: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  // LST-COUNT-01: the existence probe must answer truthfully. It previously fell through to the
  // count branch and returned no rows, so every spec table read as ABSENT while the count still
  // returned 12 — a self-contradictory fixture. The route now reports a degraded count when tables
  // are missing, which surfaced that contradiction. Echo the probed names back as present.
  if (sql.includes("to_regclass")) {
    const probed = (params?.[0] as string[] | undefined) ?? [];
    return { rows: probed.map((tbl) => ({ tbl })) };
  }
  return { rows: [{ count: 12 }] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("lists-counts routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    isCompanyMember = true;
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        role: "Owner",
      };
    });
    await registerListsCountsRoutes(app);
    return app;
  }

  for (const module of LISTS_MODULE_KEYS) {
    it(`GET /api/v1/lists/${module}/count returns live count`, async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/lists/${module}/count?operating_company_id=${companyId}`,
      });

      expect(response.statusCode).toBe(200);
      // Every module count is now a single query result with no per-module literal added on top —
      // accounting's ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT=3 stub (12 + 3 = 15) was removed in
      // #3441; journal_entry_types is counted like any other real table via the mocked query.
      expect(response.json()).toEqual({ count: 12 });
    });
  }

  it("cross-tenant authz: same-company caller (seeded membership) is allowed (200)", async () => {
    isCompanyMember = true;
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/dispatch/count?operating_company_id=${companyId}`,
    });
    expect(response.statusCode).toBe(200);
  });

  it("cross-tenant authz: cross-company caller (no membership) is rejected (403)", async () => {
    isCompanyMember = false;
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/dispatch/count?operating_company_id=${companyId}`,
    });
    expect(response.statusCode).toBe(403);
  });

  // LST-COUNT-01: names_master is no longer an empty spec — its live Brokers catalog is a typed slice
  // of mdata.customers, so the badge reads a real table instead of emitting `SELECT 0::int`.
  it("countModuleRecords returns the brokers count for names_master", async () => {
    // The old one-shot override forced a 0 back when names_master had an EMPTY spec and therefore
    // never ran an existence probe. It now would intercept that probe instead of the count, so the
    // default mock (which answers both truthfully) is used.
    const result = await countModuleRecords({ query: queryMock }, "names_master", companyId);
    // The point of this test changed with LST-COUNT-01: names_master used to have an EMPTY spec, so
    // buildModuleCountQuery emitted `SELECT 0::int` and the badge was a permanent zero no matter what
    // the database held. It now queries a real table, so it returns whatever that query yields (the
    // fixture's 12) and reports nothing missing.
    expect(result.count).toBe(12);
    expect(result.missing).toEqual([]);
  });
});
