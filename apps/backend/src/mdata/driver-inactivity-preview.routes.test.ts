import { describe, expect, it, vi, beforeEach } from "vitest";

// AUTO-14 — backend read-endpoint smoke tests. Mocks auth + db + service so the handler runs with no
// real pool/session: we exercise the route plumbing (auth gate, role gate, query validation, SET LOCAL
// company scope, passthrough of the service payload). Tests only — touches NO production code path.

let requireAuthResult = true;
vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!requireAuthResult) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return Boolean(req.user);
  },
}));

// Run the body directly with a fake client that records the SQL (and bound values) it is asked to run.
let recordedSql: string[] = [];
let recordedCalls: Array<{ sql: string; values?: unknown[] }> = [];
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_uuid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async (sql: string, values?: unknown[]) => { recordedSql.push(sql); recordedCalls.push({ sql, values }); return { rows: [] }; } }),
}));

const INACTIVITY_PAYLOAD = { mode: "login", drivers: [], generated_at: "2026-06-18T00:00:00.000Z" };
const DRIVING_PAYLOAD = { mode: "driving", drivers: [], generated_at: "2026-06-18T00:00:00.000Z" };
vi.mock("./driver-inactivity-preview.service.js", () => ({
  previewDriverInactivity: async () => INACTIVITY_PAYLOAD,
  previewDriverDrivingInactivity: async () => DRIVING_PAYLOAD,
}));

const { registerDriverInactivityPreviewRoutes } = await import("./driver-inactivity-preview.routes.js");

// Capture every GET handler the module registers, keyed by path.
function captureRoutes() {
  const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  const app = { get: (path: string, h: (req: unknown, reply: unknown) => Promise<unknown>) => { handlers[path] = h; } } as never;
  registerDriverInactivityPreviewRoutes(app);
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
const LOGIN_PATH = "/api/v1/mdata/drivers/inactivity-preview";
const DRIVING_PATH = "/api/v1/mdata/drivers/driving-inactivity-preview";

describe("driver inactivity preview routes (read-only smoke)", () => {
  beforeEach(() => { requireAuthResult = true; recordedSql = []; recordedCalls = []; });

  it("registers both read endpoints", () => {
    const handlers = captureRoutes();
    expect(Object.keys(handlers).sort()).toEqual([LOGIN_PATH, DRIVING_PATH].sort());
  });

  it("401s when unauthenticated and never touches the db", async () => {
    requireAuthResult = false;
    const handler = captureRoutes()[LOGIN_PATH];
    const { reply, out } = makeReply();
    await handler({ user: undefined, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(401);
    expect(recordedSql).toHaveLength(0);
  });

  it("403s for a non office-admin role", async () => {
    const handler = captureRoutes()[LOGIN_PATH];
    const { reply, out } = makeReply();
    await handler({ user: { uuid: OWNER.uuid, role: "Driver" }, query: { operating_company_id: OCI } }, reply);
    expect(out.code).toBe(403);
    expect(recordedSql).toHaveLength(0);
  });

  it("400s when operating_company_id is missing/invalid", async () => {
    const handler = captureRoutes()[LOGIN_PATH];
    const { reply, out } = makeReply();
    await handler({ user: OWNER, query: {} }, reply);
    expect(out.code).toBe(400);
    expect(out.body).toMatchObject({ error: "validation_error" });
  });

  it("scopes the company (parameterized set_config) and returns the login-inactivity payload", async () => {
    const handler = captureRoutes()[LOGIN_PATH];
    const { reply, out } = makeReply();
    await handler({ user: OWNER, query: { operating_company_id: OCI } }, reply);
    expect(out.body).toEqual(INACTIVITY_PAYLOAD);
    // SQLi→RLS-bypass hardening: company scoping is now a PARAMETERIZED set_config with the
    // company id as a BOUND value ($1), never interpolated into the SQL text.
    const scopeCall = recordedCalls.find((c) => c.sql.includes("set_config('app.operating_company_id'"));
    expect(scopeCall).toBeDefined();
    expect(scopeCall?.values).toEqual([OCI]);
  });

  it("returns the driving-inactivity payload on the driving endpoint", async () => {
    const handler = captureRoutes()[DRIVING_PATH];
    const { reply, out } = makeReply();
    await handler({ user: OWNER, query: { operating_company_id: OCI } }, reply);
    expect(out.body).toEqual(DRIVING_PAYLOAD);
  });
});
