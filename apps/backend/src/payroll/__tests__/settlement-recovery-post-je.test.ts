import { beforeEach, describe, expect, it, vi } from "vitest";

// A3-2 FALLBACK PAIRED JE — postSettlement posts Dr settlement-expense / Cr QBO-149 for the recovery,
// atomic with the ledger decrement, only when flag ON and recovery > 0.

const m = vi.hoisted(() => ({
  queryMock: vi.fn(),
  createBillMock: vi.fn(),
  payBillMock: vi.fn(),
  resolveRoleAccountMock: vi.fn(),
  resolveMinNetMock: vi.fn(),
  resolveCategoryMock: vi.fn(),
  createJournalEntryMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_u: string, fn: (c: { query: typeof m.queryMock }) => Promise<unknown>) => fn({ query: m.queryMock }),
}));
vi.mock("../../accounting/bills.service.js", () => ({ createBill: m.createBillMock, payBill: m.payBillMock }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: m.resolveRoleAccountMock }));
vi.mock("../../accounting/escrow/service.js", () => ({ openEscrow: vi.fn(), depositEscrow: vi.fn() }));
vi.mock("../../driver-finance/settlement-deduction-cap.service.js", () => ({ resolveSettlementMinNet: m.resolveMinNetMock }));
vi.mock("../../accounting/expense-category-map/resolver.service.js", () => ({ resolveAccountForCategory: m.resolveCategoryMock }));
vi.mock("../../accounting/journal-entries.service.js", () => ({ createJournalEntry: m.createJournalEntryMock }));

const { postSettlement } = await import("../driver-settlement.service.js");

const SETTLEMENT = {
  id: "settlement-1",
  operating_company_id: "oc-1",
  driver_id: "driver-1",
  pay_period_start: "2026-05-01",
  pay_period_end: "2026-05-07",
  gross_cents: 100000,
  deductions_cents: 50000,
  net_cents: 50000,
  bank_settle_date: "2026-05-08",
  accounting_bill_id: null,
  accounting_bill_payment_id: null,
  qbo_bill_id: null,
  qbo_bill_payment_id: null,
  status: "draft",
};

function setup(opts: { flagOn: boolean; pending: { id: string; amount_cents: string; remaining_balance_cents: string | null }[] }) {
  const ledgerUpdates: { sql: string; params: unknown[] }[] = [];
  m.resolveRoleAccountMock.mockResolvedValue("exp-account");
  m.resolveMinNetMock.mockResolvedValue({ pct: 50, cents: 0, pctSource: "env", centsSource: "env" });
  m.resolveCategoryMock.mockResolvedValue({ account_id: "qbo-149", posting_side: "debit" });
  m.createBillMock.mockResolvedValue({ id: "bill-1", qbo_bill_id: null });
  m.payBillMock.mockResolvedValue({ id: "bp-1", qbo_bill_payment_id: null });
  m.createJournalEntryMock.mockResolvedValue({ id: "je-1" });
  m.queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("feature_flags")) return { rows: [{ default_enabled: opts.flagOn }] };
    if (sql.includes("FROM payroll.driver_settlements") && sql.includes("FOR UPDATE")) return { rows: [SETTLEMENT] };
    if (sql.includes("FROM mdata.drivers")) return { rows: [{ qbo_vendor_id: "VND-1" }] };
    if (sql.includes("driver_bond_deduction")) return { rows: [{ amount_cents: 0 }] };
    if (sql.includes("FROM driver_finance.driver_settlement_deductions") && sql.includes("FOR UPDATE")) {
      return { rows: opts.pending.map((p) => ({ ...p, deduction_type: "cash_advance_repayment" })) };
    }
    if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) {
      ledgerUpdates.push({ sql, params: params ?? [] });
      return { rows: [] };
    }
    if (sql.includes("UPDATE payroll.driver_settlements")) return { rows: [{ ...SETTLEMENT, status: "posted", accounting_bill_id: "bill-1", accounting_bill_payment_id: "bp-1" }] };
    throw new Error(`Unhandled SQL: ${sql.slice(0, 60)}`);
  });
  return { ledgerUpdates };
}

beforeEach(() => Object.values(m).forEach((fn) => fn.mockReset()));

describe("A3-2 postSettlement paired JE", () => {
  it("flag ON + recovery>0: posts ONE balanced JE (Dr expense / Cr QBO-149) = the ledger draw-down", async () => {
    setup({ flagOn: true, pending: [{ id: "d1", amount_cents: "150000", remaining_balance_cents: null }] });
    await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");

    expect(m.createJournalEntryMock).toHaveBeenCalledOnce();
    const je = m.createJournalEntryMock.mock.calls[0][0];
    const debit = je.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "debit");
    const credit = je.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    // gross 100000 - floor 50000 = recover 50000
    expect(debit).toMatchObject({ account_id: "exp-account", amount_cents: 50000 });
    expect(credit).toMatchObject({ account_id: "qbo-149", amount_cents: 50000 });
    // balanced
    expect(debit.amount_cents).toBe(credit.amount_cents);
  });

  it("books-reconcile: the ledger decrement equals the QBO-149 credit", async () => {
    const { ledgerUpdates } = setup({ flagOn: true, pending: [{ id: "d1", amount_cents: "150000", remaining_balance_cents: "150000" }] });
    await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");
    // ledger row d1: 150000 -> remaining 100000 (decrement 50000), status partial
    const upd = ledgerUpdates.find((u) => u.sql.includes("remaining_balance_cents"));
    expect(upd?.params[1]).toBe(100000); // new remaining
    expect(upd?.params[2]).toBe("partial");
    const credit = m.createJournalEntryMock.mock.calls[0][0].postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    expect(150000 - Number(upd?.params[1])).toBe(credit.amount_cents); // decrement == credit
  });

  it("recovery = 0 (no pending): NO journal entry posted — byte-identical to today", async () => {
    setup({ flagOn: true, pending: [] });
    await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");
    expect(m.createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("flag OFF: no recovery query, no JE (legacy Bill+BillPayment only)", async () => {
    setup({ flagOn: false, pending: [{ id: "d1", amount_cents: "150000", remaining_balance_cents: null }] });
    await postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1");
    expect(m.createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("atomic: if the JE throws, the exception propagates (transaction rolls back the staged ledger updates)", async () => {
    setup({ flagOn: true, pending: [{ id: "d1", amount_cents: "150000", remaining_balance_cents: null }] });
    m.createJournalEntryMock.mockRejectedValueOnce(new Error("je_failed"));
    await expect(postSettlement({ settlementId: "settlement-1", operatingCompanyId: "oc-1" }, "user-1")).rejects.toThrow("je_failed");
    // the settlement status UPDATE must NOT have run (post aborted before commit)
    const statusUpdateCalled = m.queryMock.mock.calls.some((c) => String(c[0]).includes("UPDATE payroll.driver_settlements"));
    expect(statusUpdateCalled).toBe(false);
  });
});
