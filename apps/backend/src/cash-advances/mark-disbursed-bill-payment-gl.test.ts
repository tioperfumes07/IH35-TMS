import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// C6 (GO-23) — mark-disbursed's linked_bill_id branch inserts accounting.bill_payments directly
// with no JE poster call; cash-advance-disburse.ts's sibling path (disburseDriverAdvanceCore)
// correctly posts via postSourceTransactionInClientTx. This proves the fix: postBillPaymentGlIfEnabled
// (the SAME poster cc-payment.routes.ts already uses for this exact data shape) is called with the
// real bill_payment id when linked_bill_id is present, and is NEVER called when it is not.

const mockQuery = vi.fn();
const mockAssertMembership = vi.fn().mockResolvedValue(undefined);
const mockRequireAuth = vi.fn(() => true);
const mockPostBillPaymentGl = vi.fn().mockResolvedValue({ posted: false, reason: "posting_disabled" });

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));
vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: (...args: unknown[]) => mockAssertMembership(...args),
}));
vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./cash-advance-create.js", () => ({
  createDriverCashAdvanceCore: vi.fn(),
  resolveCompanyCashAdvanceThresholdDollars: vi.fn().mockResolvedValue(500),
}));
vi.mock("../accounting/bill-payment-gl.service.js", () => ({
  postBillPaymentGlIfEnabled: (...args: unknown[]) => mockPostBillPaymentGl(...args),
}));

const { registerCashAdvancesRoutes } = await import("./cash-advances.routes.js");

const OC = "0c000000-0000-4000-8000-000000000001";
const ADVANCE_ID = "ad000000-0000-4000-8000-000000000001";
const BILL_PAYMENT_ID = "bp000000-0000-4000-8000-000000000001";

function advanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ADVANCE_ID,
    operating_company_id: OC,
    disbursement_status: "approved",
    disbursement_method: "direct_bank_transfer",
    amount: "250.00",
    linked_bill_id: null,
    ...overrides,
  };
}

async function buildApp(advance: Record<string, unknown>) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT *") && sql.includes("FROM driver_finance.driver_advances")) {
      return { rows: [advance], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO accounting.bill_payments")) {
      return { rows: [{ id: BILL_PAYMENT_ID }], rowCount: 1 };
    }
    if (sql.includes("UPDATE accounting.bills")) return { rows: [], rowCount: 1 };
    if (sql.includes("UPDATE driver_finance.driver_advances")) return { rows: [], rowCount: 1 };
    if (sql.includes("views.cash_advances_with_context")) {
      return { rows: [{ id: ADVANCE_ID, disbursement_status: "disbursed" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as unknown as { user: { uuid: string; role: string } }).user = { uuid: "user-1", role: "Owner" };
  });
  await registerCashAdvancesRoutes(app as unknown as FastifyInstance);
  return app;
}

describe("PATCH /cash-advances/:id/mark-disbursed — C6 bill_payment GL post", () => {
  beforeEach(() => {
    mockPostBillPaymentGl.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls postBillPaymentGlIfEnabled with the real bill_payment id when linked_bill_id is set", async () => {
    const app = await buildApp(advanceRow({ linked_bill_id: "bill-1" }));
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/cash-advances/${ADVANCE_ID}/mark-disbursed?operating_company_id=${OC}`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(mockPostBillPaymentGl).toHaveBeenCalledWith(OC, BILL_PAYMENT_ID, { userId: "user-1" });
  });

  it("never calls postBillPaymentGlIfEnabled when there is no linked bill", async () => {
    const app = await buildApp(advanceRow({ linked_bill_id: null }));
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/cash-advances/${ADVANCE_ID}/mark-disbursed?operating_company_id=${OC}`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(mockPostBillPaymentGl).not.toHaveBeenCalled();
  });

  it("a poster failure does not fail the disbursement response (best-effort)", async () => {
    mockPostBillPaymentGl.mockRejectedValueOnce(new Error("boom"));
    const app = await buildApp(advanceRow({ linked_bill_id: "bill-1" }));
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/cash-advances/${ADVANCE_ID}/mark-disbursed?operating_company_id=${OC}`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(mockPostBillPaymentGl).toHaveBeenCalledTimes(1);
  });
});
