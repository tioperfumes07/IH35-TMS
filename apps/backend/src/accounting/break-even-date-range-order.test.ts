import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0043-BREAK-EVEN-DATE-RANGE-ORDER-UNVALIDATED: same class as GO-0036/GO-0037/GO-0039/GO-0041
// -- GET /api/v1/finance/break-even never validated from_date <= to_date. A reversed range made
// every downstream BETWEEN/>=+<= predicate silently unsatisfiable, returning a legitimate 200
// with a fully-formed, plausible-looking zero-activity break-even payload (0 revenue, 0 miles,
// empty expense_lines) -- indistinguishable from a genuine no-activity period. The frontend
// DatePicker already blocks this via min/max, but that's a UI-only guard with no server backstop.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }) => {
    req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" };
    return true;
  },
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: unknown) => Promise<unknown>) => fn({}),
}));

vi.mock("./break-even.service.js", () => ({
  getBreakEvenInputs: vi.fn().mockResolvedValue({
    revenue: { gl_revenue_cents: 0, loads_gross_revenue_cents: 0 },
    miles: { total_miles: 0 },
    expense_lines: [],
    totals: { total_cost_cents: 0 },
    days_in_period: 1,
  }),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const { registerBreakEvenRoutes } = await import("./break-even.routes.js");
  await app.register(registerBreakEvenRoutes);
  await app.ready();
  return app;
}

describe("break-even.routes.ts — date-range order validation (GO-0043)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("rejects from_date > to_date with 400, before calling getBreakEvenInputs", async () => {
    app = await buildApp();
    const { getBreakEvenInputs } = await import("./break-even.service.js");
    vi.mocked(getBreakEvenInputs).mockClear();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/finance/break-even?operating_company_id=${COMPANY_ID}&from_date=2026-06-01&to_date=2026-01-01`,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).details.period[0]).toMatch(/from_date must be on or before to_date/i);
    expect(getBreakEvenInputs).not.toHaveBeenCalled();
  });

  it("accepts a valid range and calls getBreakEvenInputs", async () => {
    app = await buildApp();
    const { getBreakEvenInputs } = await import("./break-even.service.js");
    vi.mocked(getBreakEvenInputs).mockClear();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/finance/break-even?operating_company_id=${COMPANY_ID}&from_date=2026-01-01&to_date=2026-06-01`,
    });
    expect(res.statusCode).toBe(200);
    expect(getBreakEvenInputs).toHaveBeenCalledTimes(1);
  });

  it("still succeeds with no dates at all (order check only applies when both are present)", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/api/v1/finance/break-even?operating_company_id=${COMPANY_ID}` });
    expect(res.statusCode).toBe(200);
  });
});
