import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import dailyReconPlugin from "./daily-recon.routes.js";

// CODER-27 regression: isDailyReconEnabled() reads lib.feature_flags (flag_key/default_enabled) —
// NOT the non-existent public.feature_flags (which made the gate permanently inert, R08). Flag ON →
// the screen returns its data shape (gl_posting_active: true); flag OFF/absent → honest empty.

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
  // The flag query hits lib.feature_flags; everything else (recon rows) returns empty.
  queryMock.mockImplementation(async (sql: string) => {
    if (/lib\.feature_flags/i.test(sql)) {
      return { rows: flagState.enabled ? [{ default_enabled: true }] : [] };
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
