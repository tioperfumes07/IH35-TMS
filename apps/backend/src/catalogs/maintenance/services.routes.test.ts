import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression guard for the services-catalog 500 (mdata.maintenance_services was missing → 42P01). The fix is
// the additive migration that creates the table; this test locks the HANDLER contract so it returns a
// 200-shaped { rows, total, page, limit } (rows-or-empty), never a 500, given the table now exists. Mocks
// auth + db (no real pool/session) and drives the GET handler with an empty result set.

let requireAuthResult = true;
vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!requireAuthResult) { reply.code(401).send({ error: "unauthorized" }); return false; }
    return Boolean(req.user);
  },
}));

// withCurrentUser runs the body with a fake client whose query returns the canned rows (empty table case).
let queryRows: unknown[] = [];
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_uuid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rows: queryRows }) }),
}));
vi.mock("./eta-calculator.js", () => ({ calculateServiceEta: () => ({}) }));

const { registerMaintenanceServicesCatalogRoutes } = await import("./services.routes.js");

function captureRoutes() {
  const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  const app = {
    get: (p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[`GET ${p}`] = h; },
    post: (p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[`POST ${p}`] = h; },
    patch: (p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[`PATCH ${p}`] = h; },
    delete: (p: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[`DELETE ${p}`] = h; },
  } as never;
  registerMaintenanceServicesCatalogRoutes(app);
  return handlers;
}

function makeReply() {
  const out: { code: number; body: unknown } = { code: 200, body: undefined };
  const reply = { code(n: number) { out.code = n; return reply; }, send(b: unknown) { out.body = b; return reply; } };
  return { reply, out };
}

const PATH = "GET /api/v1/catalogs/maintenance/services-catalog";
const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const OWNER = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };

describe("maintenance services-catalog GET (missing-table 500 regression guard)", () => {
  beforeEach(() => { requireAuthResult = true; queryRows = []; });

  it("registers the services-catalog list endpoint", () => {
    expect(Object.keys(captureRoutes())).toContain(PATH);
  });

  it("returns a 200-shaped { rows, total, page, limit } on an EMPTY table (no 500)", async () => {
    const handler = captureRoutes()[PATH];
    const { reply, out } = makeReply();
    const result = await handler({ user: OWNER, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(200); // never an error code
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50 });
  });

  it("returns rows when the table has data", async () => {
    queryRows = [{ id: "s1", service_code: "PM-A", service_name: "PM A Service", service_category: "PM" }];
    const handler = captureRoutes()[PATH];
    const { reply } = makeReply();
    const result = (await handler({ user: OWNER, query: { operating_company_id: OCI } }, reply)) as { rows: unknown[]; total: number };
    // count query + list query both return queryRows; total derives from the count row's `.total`.
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(1);
  });

  it("400s on a missing operating_company_id", async () => {
    const handler = captureRoutes()[PATH];
    const { reply, out } = makeReply();
    await handler({ user: OWNER, query: {} }, reply);
    expect(out.code).toBe(400);
  });

  it("401s when unauthenticated", async () => {
    requireAuthResult = false;
    const handler = captureRoutes()[PATH];
    const { reply, out } = makeReply();
    await handler({ user: undefined, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(401);
  });
});
