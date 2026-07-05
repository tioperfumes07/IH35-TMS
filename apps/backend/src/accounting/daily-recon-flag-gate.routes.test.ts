import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import dailyReconPlugin from "./daily-recon.routes.js";

// CODER-27 regression: isDailyReconEnabled() reads lib.feature_flags (flag_key/default_enabled) —
// NOT the non-existent public.feature_flags (which made the gate permanently inert, R08). Flag ON →
// the screen returns its data shape (gl_posting_active: true); flag OFF/absent → honest empty.
//
// H3-2 update: the gate now resolves through the canonical isEnabled() resolver, scoped per entity.
// GL_POSTING_ENABLED is a per-entity money-posting flag, so a GLOBAL default_enabled can NEVER turn it
// on — enable is ONLY via an explicit per-entity (operating_company_id) override. The "flag on" case is
// therefore simulated with a per-entity override row for the requesting company, not a global default.

const OPERATING_COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const flagState = { enabled: false };

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("./shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
    withCompanyScope: async (_u: string, _c: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock }),
  };
});

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  flagState.enabled = false;
});

async function build() {
  const app = Fastify();
  apps.push(app);
  // isEnabled() issues two reads: the flag row (lib.feature_flags) and the per-entity/user override
  // (lib.feature_flag_overrides). GL_POSTING_ENABLED is a posting flag → the resolver ignores the
  // global default_enabled and enables ONLY on an explicit per-entity override, so "flag on" is
  // modeled as a tenant override row for OPERATING_COMPANY_ID. Everything else (recon rows) is empty.
  queryMock.mockImplementation(async (sql: string) => {
    if (/lib\.feature_flag_overrides/i.test(sql)) {
      return {
        rows: flagState.enabled
          ? [
              {
                uuid: "22222222-2222-4222-8222-222222222222",
                flag_key: "GL_POSTING_ENABLED",
                operating_company_id: OPERATING_COMPANY_ID,
                user_uuid: null,
                enabled: true,
                set_by_user_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                set_at: "2026-01-01T00:00:00Z",
                expires_at: null,
              },
            ]
          : [],
      };
    }
    if (/lib\.feature_flags/i.test(sql)) {
      return { rows: [{ flag_key: "GL_POSTING_ENABLED", description: null, default_enabled: false, rollout_pct: 0 }] };
    }
    return { rows: [] };
  });
  await app.register(dailyReconPlugin);
  return app;
}

const URL = "/api/v1/accounting/daily-recon?operating_company_id=11111111-1111-4111-8111-111111111111";

describe("CODER-27 — daily-recon flag gate reads lib.feature_flags", () => {
  it("flag absent/off → honest empty (gl_posting_active false, no 500, no public.feature_flags)", async () => {
    flagState.enabled = false;
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gl_posting_active: false, total: 0, days: [] });
    // gate read the canonical table, never the phantom one
    expect(queryMock.mock.calls.some((c) => /lib\.feature_flags/i.test(String(c[0])))).toBe(true);
    expect(queryMock.mock.calls.some((c) => /public\.feature_flags/i.test(String(c[0])))).toBe(false);
  });

  it("flag on → screen active (gl_posting_active true)", async () => {
    flagState.enabled = true;
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gl_posting_active: true });
  });
});
