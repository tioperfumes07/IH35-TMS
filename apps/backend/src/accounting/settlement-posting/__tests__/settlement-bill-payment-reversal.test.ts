import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withCurrentUser: vi.fn(),
  reverseSource: vi.fn(),
  reverseJournal: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("../../../auth/db.js", () => ({ withCurrentUser: mocks.withCurrentUser }));
vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: vi.fn(),
  reversePostedSourceTransactionInClientTx: mocks.reverseSource,
}));
vi.mock("../../journal-entries.service.js", () => ({
  createJournalEntry: vi.fn(),
  reverseJournalEntryNoFlip: mocks.reverseJournal,
}));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendAudit }));

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SETTLEMENT = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const BILL = "44444444-4444-4444-8444-444444444444";
const PAYMENT = "55555555-5555-4555-8555-555555555555";
const BILL_JE = "66666666-6666-4666-8666-666666666666";
const PAYMENT_JE = "77777777-7777-4777-8777-777777777777";
const DEDUCTION_JE = "88888888-8888-4888-8888-888888888888";
const BILL_REV = "99999999-9999-4999-8999-999999999999";
const PAYMENT_REV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEDUCTION_REV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeClient(options?: { residualCents?: number }) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM driver_finance.driver_settlement_gl_runs")) {
        return { rows: [{ id: RUN, status: "posted", deduction_journal_entry_id: DEDUCTION_JE }] };
      }
      if (sql.includes("FROM driver_finance.driver_settlement_gl_bills")) {
        return {
          rows: [{
            accounting_bill_id: BILL,
            bill_journal_entry_id: BILL_JE,
            cash_bill_payment_id: PAYMENT,
            cash_journal_entry_id: PAYMENT_JE,
            deduction_bill_payment_id: null,
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
    mocks.reverseSource.mockRejectedValueOnce(periodLocked);

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

  it("uses one transaction client for every canonical reversal, proves full net-zero, then transitions state", async () => {
    const { client, calls } = makeClient();
    mocks.withCurrentUser.mockImplementation(async (_userId, fn) => fn(client));

    const { reverseSettlementBillPayment } = await import("../settlement-bill-payment-posting.service.js");
    const result = await reverseSettlementBillPayment(
      { operatingCompanyId: COMPANY, settlementId: SETTLEMENT, reason: "complete reversal" },
      { userId: USER }
    );

    expect(result).toEqual({ result: "reversed", settlement_id: SETTLEMENT, run_id: RUN });
    expect(mocks.reverseSource).toHaveBeenCalledTimes(2);
    expect(mocks.reverseSource.mock.calls.every((call) => call[0] === client)).toBe(true);
    expect(mocks.reverseJournal).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ journalEntryId: DEDUCTION_JE, operatingCompanyId: COMPANY })
    );
    const proofIndex = calls.findIndex((c) => c.sql.includes("WITH selected AS"));
    const statusIndex = calls.findIndex((c) => c.sql.includes("SET status = 'reversed'"));
    expect(proofIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(proofIndex);
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
  });
});
