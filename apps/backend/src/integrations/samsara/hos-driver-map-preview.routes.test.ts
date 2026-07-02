import { describe, expect, it, vi, beforeEach } from "vitest";

// AUTO-14 — backend read-endpoint smoke test for the read-only driver↔Samsara map preview. Mocks auth +
// db + service so the handler runs with no real pool/session: exercises the auth gate, role gate, query
// validation, SET LOCAL company scope, and passthrough of the diagnostic payload. Tests only.

let requireAuthResult = true;
vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!requireAuthResult) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return Boolean(req.user);
  },
}));

let recordedSql: string[] = [];
let recordedCalls: Array<{ sql: string; values?: unknown[] }> = [];
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_uuid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async (sql: string, values?: unknown[]) => { recordedSql.push(sql); recordedCalls.push({ sql, values }); return { rows: [] }; } }),
}));

const MAP_PAYLOAD = { matched: [], unmatched: [], downstream: { active_driver_query_count: 0 } };
vi.mock("./hos-driver-map-preview.service.js", () => ({
  previewDriverSamsaraMap: async () => MAP_PAYLOAD,
}));

const { registerHosDriverMapPreviewRoutes } = await import("./hos-driver-map-preview.routes.js");

function captureRoutes() {
  const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  const app = { get: (path: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[path] = h; } } as never;
  registerHosDriverMapPreviewRoutes(app);
  return handlers;
}

function makeReply() {
  const out: { code: number; body: unknown } = { code: 200, body: undefined };
  const reply = {
    code(n: number) { out.code = n; return reply; },
    send(b: unknown) { out.body = b; return reply; },
  };
  return { reply, out };
}

const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const OWNER = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };
const PATH = "/api/v1/telematics/hos-driver-map/preview";

describe("hos driver-map preview route (read-only smoke)", () => {
  beforeEach(() => { requireAuthResult = true; recordedSql = []; recordedCalls = []; });

  it("registers the preview endpoints (read-only)", () => {
    expect(Object.keys(captureRoutes())).toEqual([PATH, "/api/v1/telematics/driver-hire-date/preview"]);
  });

  it("401s when unauthenticated and never touches the db", async () => {
    requireAuthResult = false;
    const { reply, out } = makeReply();
    await captureRoutes()[PATH]({ user: undefined, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(401);
    expect(recordedSql).toHaveLength(0);
  });

  it("403s for a non office-admin role", async () => {
    const { reply, out } = makeReply();
    await captureRoutes()[PATH]({ user: { uuid: OWNER.uuid, role: "Manager" }, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(403);
  });

  it("400s when operating_company_id is missing/invalid", async () => {
    const { reply, out } = makeReply();
    await captureRoutes()[PATH]({ user: OWNER, query: { operating_company_id: "not-a-uuid" } }, reply);
    expect(out.code).toBe(400);
  });

  it("scopes the company (parameterized set_config) and returns the diagnostic payload", async () => {
    const { reply, out } = makeReply();
    await captureRoutes()[PATH]({ user: OWNER, query: { operating_company_id: OCI } }, reply);
    expect(out.body).toEqual(MAP_PAYLOAD);
    // SQLi→RLS-bypass hardening: company scoping is now a PARAMETERIZED set_config with the
    // company id as a BOUND value ($1), never interpolated into the SQL text.
    const scopeCall = recordedCalls.find((c) => c.sql.includes("set_config('app.operating_company_id'"));
    expect(scopeCall).toBeDefined();
    expect(scopeCall?.values).toEqual([OCI]);
  });
});
