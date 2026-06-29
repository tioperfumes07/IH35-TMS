import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDispatchMarginRoutes } from "./dispatch-margin.routes.js";

// CODER-14 500-safety regression: GET /api/v1/reports/dispatch-margin must NOT 500 when
// driver_finance.settlement_lines has no load_id (§4 — it links via driver_settlements, not directly).
// The tolls CTE is now guarded by a columnExists check and degrades to 0 tolls instead of 42703.

const { queryMock } = vi.hoisted(() => ({
  // First call = the columnExists probe → return [] (load_id ABSENT, the real prod state → degrade path).
  // All other calls (the main margin query) → empty result set.
  queryMock: vi.fn(async (sql: string) => {
    if (/information_schema\.columns/i.test(sql)) return { rows: [] };
    return { rows: [] };
  }),
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
});

describe("reports dispatch-margin — settlement_lines.load_id 500-safety (CODER-14)", () => {
  it("returns 200 (no 42703 500) when settlement_lines.load_id is absent", async () => {
    const app = Fastify();
    apps.push(app);
    await registerDispatchMarginRoutes(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/dispatch-margin?operating_company_id=11111111-1111-4111-8111-111111111111&from=2026-01-01&to=2026-03-31&basis=accrual",
    });
    expect(res.statusCode).toBe(200);
    expect(res.statusCode).not.toBe(500);
    // the columnExists probe must have run (proves the guard is wired)
    expect(queryMock.mock.calls.some((c) => /information_schema\.columns/i.test(String(c[0])))).toBe(true);
  });
});
