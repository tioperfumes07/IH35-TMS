import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the scope helpers so we can drive the handler with a fake client (no real pool / auth).
const fakeUser = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };
let queryImpl: (sql: string) => Promise<{ rows: unknown[] }>;

vi.mock("../../accounting/shared.js", () => ({
  currentAuthUser: () => fakeUser,
  validationError: (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, _e: unknown) =>
    reply.code(400).send({ error: "validation_error" }),
  withCompanyScope: async (_userId: string, _oci: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: (sql: string) => queryImpl(sql) }),
}));

vi.mock("../../auth/db.js", () => ({
  // Run the body directly (savepoint is a no-op wrapper in the test).
  withSavepoint: async (_c: unknown, _n: string, fn: () => Promise<unknown>) => fn(),
}));

const { registerSamsaraHosReadinessRoutes } = await import("./hos-readiness.routes.js");

function captureRoute() {
  let handler: ((req: unknown, reply: unknown) => Promise<unknown>) | null = null;
  const app = { get: (_path: string, h: typeof handler) => { handler = h; } } as never;
  registerSamsaraHosReadinessRoutes(app);
  return () => handler!;
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

describe("GET hos-readiness", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns the 3 gate states + last_pull and NEVER a token value", async () => {
    queryImpl = async (sql: string) => {
      if (sql.includes("samsara_config")) return { rows: [{ is_enabled: false, has_tenant_token: true }] };
      if (sql.includes("samsara_drivers")) return { rows: [{ mapped: 4, unmapped: 7 }] };
      if (sql.includes("audit.audit_events")) {
        return { rows: [{ created_at: "2026-06-17T20:15:00.000Z", event_class: "cron_samsara_hos_pull_tick", payload: { inserted: 0, mapped_drivers: 4, unmapped_drivers: 7 } }] };
      }
      return { rows: [] };
    };
    const handler = captureRoute()();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);

    expect(out.code).toBe(200);
    const body = out.body as Record<string, unknown>;
    expect(body).toMatchObject({
      operating_company_id: OCI,
      is_enabled: false,
      token_present: true,
      mapped_driver_count: 4,
      unmapped_driver_count: 7,
    });
    expect(body.last_pull).toMatchObject({ inserted: 0, mapped_drivers: 4, unmapped_drivers: 7, skip_reason: null });

    // Hard invariant: no token value anywhere in the serialized response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/token["']?\s*:\s*["'][^"']/i); // no "token": "<value>"
    expect(Object.keys(body)).not.toContain("api_token");
    expect(Object.keys(body)).not.toContain("encrypted_api_token");
  });

  it("token_present falls back to env when tenant has no encrypted token", async () => {
    process.env.SAMSARA_API_TOKEN = "secret-should-never-be-returned";
    queryImpl = async (sql: string) => {
      if (sql.includes("samsara_config")) return { rows: [{ is_enabled: true, has_tenant_token: false }] };
      if (sql.includes("samsara_drivers")) return { rows: [{ mapped: 0, unmapped: 0 }] };
      return { rows: [] };
    };
    const handler = captureRoute()();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);
    const body = out.body as Record<string, unknown>;
    expect(body.token_present).toBe(true);
    expect(body.last_pull).toBeNull();
    expect(JSON.stringify(body)).not.toContain("secret-should-never-be-returned");
    delete process.env.SAMSARA_API_TOKEN;
  });
});
