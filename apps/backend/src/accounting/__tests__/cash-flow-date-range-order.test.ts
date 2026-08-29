import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0037-CASH-FLOW-STATEMENT-DATE-RANGE-ORDER-UNVALIDATED (same class as GO-0036, this file was
// not among the report routes fixed there): a reversed from_date/to_date range on the Cash Flow
// Statement is worse than a plain false-empty result -- getCashFlowReport() computes cash_at_start
// (entry_date < from_date) and cash_at_end (entry_date <= to_date) as two INDEPENDENT queries, so a
// reversed range produces a chronologically-inverted, self-contradictory Cash-at-start/Cash-at-end
// pair with all activity sections empty ($0) -- surfaced only as an unexplained "Needs review"
// reconciliation badge, never an actual "invalid date range" error. Both the main report route and
// its 2 export routes (pdf/xlsx, which call the same getCashFlowReport()) must reject a reversed
// range with 400 before running any query.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" };

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }) => {
    req.user = USER;
    return true;
  },
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../cash-flow.service.js", () => ({
  getCashFlowReport: vi.fn().mockResolvedValue({
    operating: { lines: [], total: 0 },
    investing: { lines: [], total: 0 },
    financing: { lines: [], total: 0 },
    net_cash_change: 0,
    cash_at_start: 0,
    cash_at_end: 0,
    reconciled: true,
  }),
}));

vi.mock("../statement-export.service.js", () => ({
  exportProfitLossStatement: vi.fn(),
  exportBalanceSheetStatement: vi.fn(),
  exportCashFlowStatement: vi.fn().mockResolvedValue({
    contentType: "application/pdf",
    filename: "cash-flow.pdf",
    buffer: Buffer.from("stub"),
  }),
  exportArAgingStatement: vi.fn(),
  exportApAgingStatement: vi.fn(),
  exportTrialBalanceStatement: vi.fn(),
}));

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
});

async function buildApp(register: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify();
  apps.push(app);
  await register(app);
  return app;
}

describe("GO-0037 cash-flow statement date-range order validation", () => {
  it("GET /api/v1/accounting/cash-flow rejects from_date > to_date with 400, accepts a valid range", async () => {
    const { registerCashFlowRoutes } = await import("../cash-flow.routes.js");
    const app = await buildApp(registerCashFlowRoutes);

    const bad = await app.inject({ method: "GET", url: `/api/v1/accounting/cash-flow?operating_company_id=${COMPANY_ID}&from_date=2026-08-25&to_date=2026-08-01` });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/from_date must be on or before to_date/i);

    const good = await app.inject({ method: "GET", url: `/api/v1/accounting/cash-flow?operating_company_id=${COMPANY_ID}&from_date=2026-08-01&to_date=2026-08-25` });
    expect(good.statusCode).toBe(200);
  });

  it("GET /api/v1/accounting/cash-flow with no dates at all still succeeds (order check only applies when both are present)", async () => {
    const { registerCashFlowRoutes } = await import("../cash-flow.routes.js");
    const app = await buildApp(registerCashFlowRoutes);

    const res = await app.inject({ method: "GET", url: `/api/v1/accounting/cash-flow?operating_company_id=${COMPANY_ID}` });
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/v1/accounting/cash-flow/export/pdf rejects a reversed range with 400 before exporting", async () => {
    const { registerStatementExportRoutes } = await import("../statement-export.routes.js");
    const app = await buildApp(registerStatementExportRoutes);
    const { exportCashFlowStatement } = await import("../statement-export.service.js");

    const bad = await app.inject({ method: "GET", url: `/api/v1/accounting/cash-flow/export/pdf?operating_company_id=${COMPANY_ID}&from_date=2026-08-25&to_date=2026-08-01` });
    expect(bad.statusCode).toBe(400);
    expect(exportCashFlowStatement).not.toHaveBeenCalled();
  });

  it("GET /api/v1/accounting/cash-flow/export/xlsx rejects a reversed range with 400 before exporting", async () => {
    const { registerStatementExportRoutes } = await import("../statement-export.routes.js");
    const app = await buildApp(registerStatementExportRoutes);
    const { exportCashFlowStatement } = await import("../statement-export.service.js");

    const bad = await app.inject({ method: "GET", url: `/api/v1/accounting/cash-flow/export/xlsx?operating_company_id=${COMPANY_ID}&from_date=2026-08-25&to_date=2026-08-01` });
    expect(bad.statusCode).toBe(400);
    expect(exportCashFlowStatement).not.toHaveBeenCalled();
  });
});
