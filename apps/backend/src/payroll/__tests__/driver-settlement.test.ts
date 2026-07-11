import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createBillMock: vi.fn(),
  payBillMock: vi.fn(),
  resolveRoleAccountMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mocked.queryMock }) => Promise<unknown>) =>
    fn({ query: mocked.queryMock }),
}));

vi.mock("../../accounting/bills.service.js", () => ({
  createBill: mocked.createBillMock,
  payBill: mocked.payBillMock,
}));

vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: mocked.resolveRoleAccountMock,
}));

import { computeSettlement, postSettlement } from "../driver-settlement.service.js";

describe("driver settlement engine (Block-22)", () => {
  beforeEach(() => {
    mocked.queryMock.mockReset();
    mocked.createBillMock.mockReset();
    mocked.payBillMock.mockReset();
    mocked.resolveRoleAccountMock.mockReset();
  });

  it("computes fixture draft for driver + 3 loads", async () => {
    mocked.resolveRoleAccountMock.mockResolvedValueOnce("exp-account").mockResolvedValueOnce("ap-account");
    const insertedLines: Array<{ amount_cents: number; line_type: string }> = [];

    mocked.queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
      // A3-2: cutover flag OFF => legacy blunt path (these fixtures assert the legacy behavior).
      // H3-4: isEnabled() now issues two reads (lib.feature_flags + lib.feature_flag_overrides); the
      // override read must return no rows (checked first — "feature_flag_overrides" contains the
      // "feature_flag" stem) so it can't fall through to the flag-row branch or the raw throw.
      if (sql.includes("feature_flag_overrides")) return { rows: [] };
      if (sql.includes("feature_flags")) return { rows: [{ default_enabled: false }] };
      if (sql.includes("FROM payroll.driver_settlements") && sql.includes("pay_period_start") && sql.includes("LIMIT 1")) {
        if (sql.includes("FOR UPDATE")) return { rows: [] };
        if (!insertedLines.length) return { rows: [] };
        return {
          rows: [
            {
              id: "settlement-1",
              operating_company_id: "oc-1",
              driver_id: "driver-1",
              pay_period_start: "2026-05-01",
              pay_period_end: "2026-05-07",
              gross_cents: 90000,
              deductions_cents: 15000,
              net_cents: 75000,
              bank_settle_date: "2026-05-08",
              accounting_bill_id: null,
              accounting_bill_payment_id: null,
              qbo_bill_id: null,
              qbo_bill_payment_id: null,
              status: "draft",
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.loads l")) {
        return {
          rows: [
            { load_id: "load-1", load_number: "L-1001", gross_amount_cents: 25000 },
            { load_id: "load-2", load_number: "L-1002", gross_amount_cents: 30000 },
            { load_id: "load-3", load_number: "L-1003", gross_amount_cents: 35000 },
          ],
        };
      }
      if (sql.includes("FROM driver_finance.cash_advance_requests")) {
        return { rows: [{ deductions_cents: 15000 }] };
      }
      if (sql.includes("INSERT INTO payroll.driver_settlements")) {
        return { rows: [{ id: "settlement-1" }] };
      }
      if (sql.includes("INSERT INTO payroll.driver_settlement_line_items")) {
        insertedLines.push({
          amount_cents: Number(values?.[5] ?? 0),
          line_type: String(values?.[2] ?? ""),
        });
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL in test: ${sql}`);
    });

    const result = await computeSettlement(
      {
        operatingCompanyId: "oc-1",
        driverId: "driver-1",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-07",
        bankSettleDate: "2026-05-08",
      },
      "user-1"
    );

    expect(result.settlement.gross_cents).toBe(90000);
    expect(result.settlement.deductions_cents).toBe(15000);
    expect(result.settlement.net_cents).toBe(75000);
    expect(result.lines).toHaveLength(4);
    expect(insertedLines).toEqual([
      { amount_cents: 25000, line_type: "load_pay" },
      { amount_cents: 30000, line_type: "load_pay" },
      { amount_cents: 35000, line_type: "load_pay" },
      { amount_cents: -15000, line_type: "advance_recovery" },
    ]);
  });

  it("posts settlement via Bill + BillPayment only", async () => {
    mocked.resolveRoleAccountMock.mockResolvedValue("exp-account");
    mocked.createBillMock.mockResolvedValue({ id: "bill-1", qbo_bill_id: null });
    mocked.payBillMock.mockResolvedValue({ id: "bp-1", qbo_bill_payment_id: null });

    mocked.queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
      // SETTLE-GATE: posting now requires SETTLEMENT_GL_POSTING_ENABLED ON for this entity — enable it via
      // a tenant override so this "posts" fixture still posts (this is now also the flag-ON acceptance case).
      // SETTLEMENT_CAPPED_RECOVERY stays OFF (no override) so the legacy blunt path is asserted, unchanged.
      if (sql.includes("feature_flag_overrides")) {
        const flagKey = String(values?.[0] ?? "");
        if (flagKey === "SETTLEMENT_GL_POSTING_ENABLED") {
          return { rows: [{ operating_company_id: "oc-1", user_uuid: null, enabled: true, expires_at: null }] };
        }
        return { rows: [] };
      }
      if (sql.includes("feature_flags")) return { rows: [{ default_enabled: false }] };
      if (sql.includes("FROM payroll.driver_settlements") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: "settlement-1",
              operating_company_id: "oc-1",
              driver_id: "driver-1",
              pay_period_start: "2026-05-01",
              pay_period_end: "2026-05-07",
              gross_cents: 90000,
              deductions_cents: 15000,
              net_cents: 75000,
              bank_settle_date: "2026-05-08",
              accounting_bill_id: null,
              accounting_bill_payment_id: null,
              qbo_bill_id: null,
              qbo_bill_payment_id: null,
              status: "draft",
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ qbo_vendor_id: "VND-001" }] };
      if (sql.includes("FROM payroll.driver_settlement_line_items") && sql.includes("driver_bond_deduction")) {
        return { rows: [{ amount_cents: 0 }] };
      }
      if (sql.includes("UPDATE payroll.driver_settlements")) {
        return {
          rows: [
            {
              id: "settlement-1",
              operating_company_id: "oc-1",
              driver_id: "driver-1",
              pay_period_start: "2026-05-01",
              pay_period_end: "2026-05-07",
              gross_cents: 90000,
              deductions_cents: 15000,
              net_cents: 75000,
              bank_settle_date: "2026-05-08",
              accounting_bill_id: "bill-1",
              accounting_bill_payment_id: "bp-1",
              qbo_bill_id: null,
              qbo_bill_payment_id: null,
              status: "posted",
            },
          ],
        };
      }
      throw new Error(`Unhandled SQL in test: ${sql}`);
    });

    const result = await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");

    expect(mocked.createBillMock).toHaveBeenCalledOnce();
    expect(mocked.payBillMock).toHaveBeenCalledOnce();
    expect("result" in result).toBe(false); // posted, not gated-off
    expect((result as { idempotent?: boolean }).idempotent).toBe(false);
    expect(result.settlement.status).toBe("posted");
  });

  it("SETTLE-GATE: SETTLEMENT_GL_POSTING_ENABLED OFF → posts nothing, returns blocked_flag_off, stays draft", async () => {
    mocked.resolveRoleAccountMock.mockResolvedValue("exp-account");

    mocked.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
      // No override + default OFF => SETTLEMENT_GL_POSTING_ENABLED resolves OFF (per-entity-gated flag).
      if (sql.includes("feature_flag_overrides")) return { rows: [] };
      if (sql.includes("feature_flags")) return { rows: [{ default_enabled: false }] };
      if (sql.includes("FROM payroll.driver_settlements") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: "settlement-1",
              operating_company_id: "oc-1",
              driver_id: "driver-1",
              pay_period_start: "2026-05-01",
              pay_period_end: "2026-05-07",
              gross_cents: 90000,
              deductions_cents: 15000,
              net_cents: 75000,
              bank_settle_date: "2026-05-08",
              accounting_bill_id: null,
              accounting_bill_payment_id: null,
              qbo_bill_id: null,
              qbo_bill_payment_id: null,
              status: "draft",
            },
          ],
        };
      }
      // Any SQL past the gate means it FAILED to block (createBill / driver lookup / etc. ran).
      throw new Error(`SETTLE-GATE leak — unexpected SQL after flag-off gate: ${sql}`);
    });

    const result = await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");

    expect((result as { result?: string }).result).toBe("blocked_flag_off");
    expect(result.settlement.status).toBe("draft");
    expect(mocked.createBillMock).not.toHaveBeenCalled();
    expect(mocked.payBillMock).not.toHaveBeenCalled();
  });
});
