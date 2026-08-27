import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyV5Routes } from "../safety-v5.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "33333333-3333-4333-8333-333333333333";
const REASON = "44444444-4444-4444-8444-444444444444";
const APPROVER = "55555555-5555-4555-8555-555555555555";
const FINE_ID = "66666666-6666-4666-8666-666666666666";
const LIABILITY_ID = "77777777-7777-4777-8777-777777777777";
const DEDUCTION_ID = "88888888-8888-4888-8888-888888888888";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit, mockAssertMembership } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  const assertCompanyMembership = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit, mockAssertMembership: assertCompanyMembership };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: mockAssertMembership,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

// The OOS-inspection path imports the WO service; it is never reached by these fine tests, but stub it so
// route registration does not pull in the full maintenance stack.
vi.mock("../../maintenance/two-section-service.js", () => ({
  createWorkOrderWithLines: vi.fn(async () => ({ woUuid: "wo", display_id: "WO-x", classHint: "x" })),
}));

function baseQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("set_config") || sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO safety.internal_fines")) {
      return { rows: [{ id: FINE_ID, status: "pending" }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO driver_finance.driver_liabilities")) {
      return { rows: [{ id: LIABILITY_ID, current_balance: 100, status: "pending_recovery" }], rowCount: 1 };
    }
    // LAW: approved fine seeds REPAIR-A pending settlement deduction (createSettlementDeduction).
    if (sql.includes("INSERT INTO driver_finance.driver_settlement_deductions")) {
      return {
        rows: [
          {
            id: DEDUCTION_ID,
            operating_company_id: COMPANY,
            driver_id: DRIVER,
            deduction_type: "fine",
            amount_cents: 100,
            reason: `Internal fine recovery: ${FINE_ID}`,
            applied_to_settlement_id: null,
            created_by_user_id: APPROVER,
            source_pending_id: null,
            load_id: null,
            bucket_id: null,
            source_bank_transaction_id: null,
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE safety.internal_fines")) {
      return { rows: [{ id: FINE_ID, status: "converted_to_liability" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("safety internal-fines approval control (FD1)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(baseQuery());
    mockAppendCrudAudit.mockClear();
    mockAssertMembership.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: APPROVER, role: "Safety", email: "safety@ih35.local" };
    });
    await registerSafetyV5Routes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects an approved fine with no approver → 400 approver_required", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/internal-fines?operating_company_id=${COMPANY}`,
      payload: {
        driver_uuid: DRIVER,
        reason_uuid: REASON,
        amount: 1,
        imposed_date: "2026-07-03",
        status: "approved",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "approver_required" });
    // No DB work should have happened — validation short-circuits before the transaction.
    const liabilityInserts = mockQuery.mock.calls.filter((c) => String(c[0]).includes("driver_finance.driver_liabilities"));
    expect(liabilityInserts).toHaveLength(0);
  });

  it("accepts an approved fine WITH an approver → 201 + liability row + pending deduction + converted status", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/internal-fines?operating_company_id=${COMPANY}`,
      payload: {
        driver_uuid: DRIVER,
        reason_uuid: REASON,
        amount: 1,
        imposed_date: "2026-07-03",
        status: "approved",
        approved_by_user_uuid: APPROVER,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.fine).toMatchObject({ id: FINE_ID });
    expect(body.liability).toMatchObject({ id: LIABILITY_ID, current_balance: 100, status: "pending_recovery" });
    const liabilityInserts = mockQuery.mock.calls.filter((c) => String(c[0]).includes("driver_finance.driver_liabilities"));
    expect(liabilityInserts).toHaveLength(1);
    const deductionInserts = mockQuery.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO driver_finance.driver_settlement_deductions")
    );
    expect(deductionInserts).toHaveLength(1);
    const converts = mockQuery.mock.calls.filter((c) => String(c[0]).includes("converted_to_liability"));
    expect(converts.length).toBeGreaterThanOrEqual(1);
    expect(mockAppendCrudAudit).toHaveBeenCalled();
    const convertAudit = mockAppendCrudAudit.mock.calls.find(
      (c) => c[2] === "safety.internal_fine.converted_to_liability"
    );
    expect(convertAudit?.[3]).toMatchObject({
      internal_fine_id: FINE_ID,
      liability_id: LIABILITY_ID,
      driver_settlement_deduction_id: DEDUCTION_ID,
    });
  });

  // SAFETY-MONEY-F6822A — the handler used to issue its OWN BEGIN/COMMIT/ROLLBACK inside the
  // callback withCurrentUser already wraps in one transaction. A nested BEGIN is a no-op in
  // Postgres, but the inner COMMIT genuinely committed the outer transaction early, mid-handler —
  // this test's mock `withCurrentUser` never sends these strings itself, so any occurrence in
  // mockQuery's call log can only come from the handler re-introducing its own transaction
  // control. Asserting zero occurrences on the full approved-fine path (fine + liability +
  // deduction + two audit calls) locks the single-transaction fix in place.
  it("never issues its own BEGIN/COMMIT/ROLLBACK — withCurrentUser owns the only transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/internal-fines?operating_company_id=${COMPANY}`,
      payload: {
        driver_uuid: DRIVER,
        reason_uuid: REASON,
        amount: 1,
        imposed_date: "2026-07-03",
        status: "approved",
        approved_by_user_uuid: APPROVER,
      },
    });
    expect(res.statusCode).toBe(201);
    const txnControlCalls = mockQuery.mock.calls.filter((c) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(String(c[0]).trim()));
    expect(txnControlCalls).toHaveLength(0);
  });

  it("creates a pending fine with NO approver and NO liability → 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/internal-fines?operating_company_id=${COMPANY}`,
      payload: {
        driver_uuid: DRIVER,
        reason_uuid: REASON,
        amount: 1,
        imposed_date: "2026-07-03",
        status: "pending",
      },
    });
    expect(res.statusCode).toBe(201);
    const liabilityInserts = mockQuery.mock.calls.filter((c) => String(c[0]).includes("driver_finance.driver_liabilities"));
    expect(liabilityInserts).toHaveLength(0);
  });
});
