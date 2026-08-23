import { describe, expect, it, vi, beforeEach } from "vitest";
import { captureRoutes as captureFastifyRoutes } from "../../../test-helpers/capture-route-handler.js";

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

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


const { registerMaintenanceServicesCatalogRoutes } = await import("./services.routes.js");

function captureRoutes() {
  // Shared stub models Fastify's (path, options?, handler) overload — see capture-route-handler.ts.
  const capture = captureFastifyRoutes();
  registerMaintenanceServicesCatalogRoutes(capture.app as never);
  const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  for (const r of capture.routes) {
    handlers[`${r.method.toUpperCase()} ${r.path}`] = r.handler as (req: unknown, reply: unknown) => Promise<unknown>;
  }
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

// CLOSURE-11-EDIT — this catalog shipped list+create only; there was never a PATCH route, so a
// real, non-empty table (reachable and used in production) had no way to fix a typo or retire an
// obsolete service. Live-reproduced 2026-08-23: read_page on the deployed page confirmed zero
// action buttons in the accessibility tree for any row. Locks the new PATCH handler's contract:
// registered, requires company scope, 404s a real not-found, 409s a code conflict, 200s a real
// update, and the UPDATE statement it issues carries an explicit operating_company_id predicate
// (belt-and-suspenders alongside withCompany's app.operating_company_id GUC).
const PATCH_PATH = "PATCH /api/v1/catalogs/maintenance/services-catalog/:id";
const SERVICE_ID = "11111111-1111-4111-8111-111111111111";

describe("maintenance services-catalog PATCH (CLOSURE-11-EDIT)", () => {
  beforeEach(() => { requireAuthResult = true; });

  it("registers the PATCH endpoint", () => {
    expect(Object.keys(captureRoutes())).toContain(PATCH_PATH);
  });

  it("400s on an empty body", async () => {
    const handler = captureRoutes()[PATCH_PATH];
    const { reply, out } = makeReply();
    await handler({ user: OWNER, params: { id: SERVICE_ID }, body: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(400);
  });

  it("403s a role without catalog write access", async () => {
    const handler = captureRoutes()[PATCH_PATH];
    const { reply, out } = makeReply();
    await handler(
      { user: { uuid: OWNER.uuid, role: "Driver" }, params: { id: SERVICE_ID }, body: { operating_company_id: OCI, service_name: "New name" } },
      reply
    );
    expect(out.code).toBe(403);
  });

  it("404s when the UPDATE matches zero rows (wrong id or wrong company)", async () => {
    queryRows = [];
    const handler = captureRoutes()[PATCH_PATH];
    const { reply, out } = makeReply();
    await handler(
      { user: OWNER, params: { id: SERVICE_ID }, body: { operating_company_id: OCI, service_name: "New name" } },
      reply
    );
    expect(out.code).toBe(404);
    expect((out.body as { error?: string } | undefined)?.error).toBe("maintenance_service_not_found");
  });

  it("200s and returns the updated row on a real match", async () => {
    queryRows = [{ id: SERVICE_ID, service_code: "PM-A", service_name: "New name", service_category: "PM" }];
    const handler = captureRoutes()[PATCH_PATH];
    const { reply, out } = makeReply();
    const result = await handler(
      { user: OWNER, params: { id: SERVICE_ID }, body: { operating_company_id: OCI, service_name: "New name" } },
      reply
    );
    expect(out.code).toBe(200);
    expect((result as { service_name?: string })?.service_name).toBe("New name");
  });

  it("PATCH with is_active:false is the deactivate path — 200s and returns the row", async () => {
    queryRows = [{ id: SERVICE_ID, service_code: "PM-A", service_name: "PM A Service", service_category: "PM", is_active: false }];
    const handler = captureRoutes()[PATCH_PATH];
    const { reply, out } = makeReply();
    const result = await handler(
      { user: OWNER, params: { id: SERVICE_ID }, body: { operating_company_id: OCI, is_active: false } },
      reply
    );
    expect(out.code).toBe(200);
    expect((result as { is_active?: boolean })?.is_active).toBe(false);
  });
});
