import { beforeEach, describe, expect, it, vi } from "vitest";

const reverseSource = vi.hoisted(() => vi.fn());
vi.mock("../posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: vi.fn(),
  reversePostedSourceTransactionInClientTx: reverseSource,
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

const COMPANY = "11111111-1111-4111-8111-111111111111";
const BILL = "22222222-2222-4222-8222-222222222222";
const PAYMENT = "33333333-3333-4333-8333-333333333333";
const BANK = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const REVERSAL_JE = "66666666-6666-4666-8666-666666666666";

function paymentClient() {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM accounting.bill_payments")) {
        return { rows: [{
          id: PAYMENT, operating_company_id: COMPANY, bill_id: BILL,
          payment_date: "2026-07-17", amount_cents: 7_500, amount: 75,
          from_bank_account_id: BANK, status: "posted", revoked_at: null,
        }] };
      }
      if (sql.includes("FROM accounting.bills")) {
        return { rows: [{
          id: BILL, amount_cents: 10_000, total_amount: 100,
          paid_cents: 10_000, paid_amount: 100, status: "paid", revoked_at: null,
        }] };
      }
      if (sql.includes("UPDATE banking.bank_accounts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  return { client, calls };
}

describe("transaction-aware canonical bill-payment void", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reverseSource.mockResolvedValue({ journal_entry_id: REVERSAL_JE });
  });

  it("reverses GL and restores payment, bill paid/status, and bank balance on one client", async () => {
    const { client, calls } = paymentClient();
    const { voidBillPaymentInClientTx } = await import("../bills.service.js");
    const result = await voidBillPaymentInClientTx(client, {
      operatingCompanyId: COMPANY, paymentId: PAYMENT, reason: "settlement cancellation",
      userId: USER, reversePostedGl: true, currentBusinessDate: "2026-07-18",
    });

    expect(result.reversal_journal_entry_id).toBe(REVERSAL_JE);
    expect(reverseSource).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ source_transaction_type: "bill_payment", source_transaction_id: PAYMENT }),
      { userId: USER },
      "2026-07-18"
    );
    expect(calls.some((call) => call.sql.includes("UPDATE accounting.bill_payments") && call.sql.includes("revoked_at = now()"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("UPDATE accounting.bills") && call.values?.[1] === 2_500 && call.values?.[3] === "partially_paid")).toBe(true);
    expect(calls.some((call) => call.sql.includes("UPDATE banking.bank_accounts") && call.values?.[2] === 7_500)).toBe(true);
  });

  it("performs no subledger mutation after a GL reversal failure", async () => {
    const { client, calls } = paymentClient();
    reverseSource.mockRejectedValue(new Error("PERIOD_LOCKED"));
    const { voidBillPaymentInClientTx } = await import("../bills.service.js");
    await expect(voidBillPaymentInClientTx(client, {
      operatingCompanyId: COMPANY, paymentId: PAYMENT, reason: "settlement cancellation",
      userId: USER, reversePostedGl: true, currentBusinessDate: "2026-07-18",
    })).rejects.toThrow("PERIOD_LOCKED");
    expect(calls.some((call) => call.sql.includes("UPDATE accounting.bill_payments"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("UPDATE accounting.bills"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("UPDATE banking.bank_accounts"))).toBe(false);
  });
});
