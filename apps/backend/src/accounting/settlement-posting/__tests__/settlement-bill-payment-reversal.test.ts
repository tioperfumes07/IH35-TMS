import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withCurrentUser: vi.fn(),
  reverseSource: vi.fn(),
  reverseJournal: vi.fn(),
  voidPayment: vi.fn(),
  voidBill: vi.fn(),
  restoreDeductions: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({ withCurrentUser: mocks.withCurrentUser }));
vi.mock("../../../lib/company-business-date.js", () => ({ companyBusinessDate: () => "2026-07-18" }));
vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: vi.fn(),
  reversePostedSourceTransactionInClientTx: mocks.reverseSource,
}));
vi.mock("../../journal-entries.service.js", () => ({
  createJournalEntry: vi.fn(),
  reverseJournalEntryNoFlip: mocks.reverseJournal,
}));
vi.mock("../../bills.service.js", () => ({
  createBill: vi.fn(),
  payBill: vi.fn(),
  voidBillPaymentInClientTx: mocks.voidPayment,
  voidBillInClientTx: mocks.voidBill,
}));
vi.mock("../settlement-posting.service.js", () => ({
  restoreSettlementDeductionsInClientTx: mocks.restoreDeductions,
}));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendAudit }));

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SETTLEMENT = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const BILL = "44444444-4444-4444-8444-444444444444";
const DRIVER_BILL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PAYMENT = "55555555-5555-4555-8555-555555555555";
const DEDUCTION_PAYMENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BILL_JE = "66666666-6666-4666-8666-666666666666";
const PAYMENT_JE = "77777777-7777-4777-8777-777777777777";
const DEDUCTION_JE = "88888888-8888-4888-8888-888888888888";
const BILL_REV = "99999999-9999-4999-8999-999999999999";
const PAYMENT_REV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEDUCTION_REV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeClient(options?: { residualCents?: number; deductionMismatch?: boolean }) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM driver_finance.driver_settlement_gl_runs")) {
        return { rows: [{ id: RUN, status: "posted", deduction_journal_entry_id: DEDUCTION_JE }] };
      }
      if (sql.includes("SELECT driver_bill_id::text, accounting_bill_id::text")) {
        return {
          rows: [{
            driver_bill_id: DRIVER_BILL,
            accounting_bill_id: BILL,
            bill_journal_entry_id: BILL_JE,
            cash_bill_payment_id: PAYMENT,
            cash_journal_entry_id: PAYMENT_JE,
            deduction_bill_payment_id: DEDUCTION_PAYMENT,
          }],
        };
      }
      if (sql.includes("WITH selected AS")) {
        const residual = options?.residualCents ?? 0;
        return {
          rows: [{
            journal_count: 6,
            nonzero_dimensions: residual === 0 ? 0 : 1,
            absolute_residual_cents: residual,
          }],
        };
      }
      if (sql.includes("WITH restored AS")) {
        return { rows: [{
          restored_count: 2,
          restored_amount_cents: 27500,
          invalid_state_count: 0,
          bucket_reversal_count: 0,
          bucket_reversal_amount_cents: 0,
          original_gl_cents: options?.deductionMismatch ? 27499 : 27500,
          reversal_gl_cents: 27500,
        }] };
      }
      if (sql.includes("UPDATE driver_finance.driver_bills")) return { rows: [{ id: DRIVER_BILL }], rowCount: 1 };
      if (sql.includes("WITH linked AS")) {
        return { rows: [{
          active_payment_count: 0,
          nonvoid_bill_count: 0,
          nonzero_paid_bill_count: 0,
          unrestored_driver_bill_count: 0,
        }] };
      }
      if (sql.includes("UPDATE driver_finance.driver_settlement_gl_runs")) {
        return { rows: [{ id: RUN }], rowCount: 1 };
      }
      return { rows: [], rowCount: sql.includes("UPDATE driver_finance.driver_settlement_gl_runs") ? 1 : 0 };
    }),
  };
  return { client, calls };
}

describe("settlement Bill+BillPayment reversal orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reverseSource.mockImplementation(async (_client, input) => ({
      result: "reversed",
      journal_entry_id: input.source_transaction_type === "bill" ? BILL_REV : PAYMENT_REV,
    }));
    mocks.voidPayment.mockImplementation(async (_client, input) => ({
      ok: true,
      bill_id: BILL,
      reversal_journal_entry_id: input.reversePostedGl ? PAYMENT_REV : null,
    }));
    mocks.voidBill.mockResolvedValue({ ok: true, reversal_journal_entry_id: BILL_REV });
    mocks.restoreDeductions.mockResolvedValue({
      deduction_ids: [
        "12121212-1212-4212-8212-121212121212",
        "13131313-1313-4313-8313-131313131313",
      ],
      deduction_count: 2,
      total_amount_cents: 27500,
      bucketed_count: 0,
      bucketed_amount_cents: 0,
    });
    mocks.reverseJournal.mockResolvedValue({
      reversal: {
        reversal_journal_entry_id: DEDUCTION_REV,
        reversal_date: "2026-07-18",
        closed_period_reversal: false,
        reversed_line_count: 3,
      },
      linkage_written: true,
    });
  });

  it("fails loud on any source-leg reversal error and never marks the run reversed", async () => {
    const { client, calls } = makeClient();
    mocks.withCurrentUser.mockImplementation(async (_userId, fn) => fn(client));
    const periodLocked = Object.assign(new Error("IH35_CLOSED_PERIOD"), { code: "PERIOD_LOCKED" });
    mocks.voidPayment.mockRejectedValueOnce(periodLocked);

    const { reverseSettlementBillPayment } = await import("../settlement-bill-payment-posting.service.js");
    await expect(
      reverseSettlementBillPayment(
        { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "period test" },
        { userId: USER }
      )
    ).rejects.toMatchObject({ code: "PERIOD_LOCKED" });

    expect(mocks.reverseJournal).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes("SET status = 'reversed'"))).toBe(false);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses partial-success state when whole-settlement reconciliation has a residual", async () => {
    const { client, calls } = makeClient({ residualCents: 500 });
    mocks.withCurrentUser.mockImplementation(async (_userId, fn) => fn(client));

    const { reverseSettlementBillPayment } = await import("../settlement-bill-payment-posting.service.js");
    await expect(
      reverseSettlementBillPayment(
        { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "reconcile test" },
        { userId: USER }
      )
    ).rejects.toThrow("settlement_reversal_not_equal_and_opposite");

    expect(calls.some((c) => c.sql.includes("SET status = 'reversed'"))).toBe(false);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses the state transition when restored deductions do not agree to the deduction GL", async () => {
    const { client, calls } = makeClient({ deductionMismatch: true });
    mocks.withCurrentUser.mockImplementation(async (_userId, fn) => fn(client));

    const { reverseSettlementBillPayment } = await import("../settlement-bill-payment-posting.service.js");
    await expect(
      reverseSettlementBillPayment(
        { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "deduction tie-out test" },
        { userId: USER }
      )
    ).rejects.toThrow("settlement_deduction_reconciliation_failed");

    expect(calls.some((c) => c.sql.includes("SET status = 'reversed'"))).toBe(false);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("uses one transaction client for every canonical reversal, proves full net-zero, then transitions state", async () => {
    const { client, calls } = makeClient();
    mocks.withCurrentUser.mockImplementation(async (_userId, fn) => fn(client));

    const { reverseSettlementBillPayment } = await import("../settlement-bill-payment-posting.service.js");
    const result = await reverseSettlementBillPayment(
      { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "complete reversal" },
      { userId: USER }
    );

    expect(result).toEqual({ result: "reversed", settlement_id: SETTLEMENT, run_id: RUN });
    expect(mocks.voidPayment).toHaveBeenCalledTimes(2);
    expect(mocks.voidPayment.mock.calls.every((call) => call[0] === client)).toBe(true);
    expect(mocks.voidPayment).toHaveBeenNthCalledWith(
      1,
      client,
      expect.objectContaining({ paymentId: PAYMENT, reversePostedGl: true, currentBusinessDate: "2026-07-18" })
    );
    expect(mocks.voidPayment).toHaveBeenNthCalledWith(
      2,
      client,
      expect.objectContaining({ paymentId: DEDUCTION_PAYMENT, reversePostedGl: false, currentBusinessDate: "2026-07-18" })
    );
    expect(mocks.voidBill).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ billId: BILL, currentBusinessDate: "2026-07-18" })
    );
    expect(mocks.reverseJournal).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        journalEntryId: DEDUCTION_JE,
        operatingCompanyId: COMPANY,
        currentBusinessDate: "2026-07-18",
      })
    );
    expect(mocks.restoreDeductions).toHaveBeenCalledWith(
      client,
      { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "complete reversal" },
      { userId: USER }
    );
    const proofIndex = calls.findIndex((c) => c.sql.includes("WITH selected AS"));
    const statusIndex = calls.findIndex((c) => c.sql.includes("SET status = 'reversed'"));
    expect(proofIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(proofIndex);
    expect(calls.some((c) => c.sql.includes("SET status = 'open'"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("WITH linked AS"))).toBe(true);
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
  });
});
