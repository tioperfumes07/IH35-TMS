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
      // ACCT-F327 (PR #5739) added this EXISTS check so voidBillPaymentInClientTx only reverses a GL
      // posting that actually exists — without it, hasPostedBatch reads false here (the generic
      // fallback below returns no rows), reversePostedGl silently becomes false regardless of the
      // caller's intent, and the reversal never runs — exactly the bug these two tests exist to catch.
      if (sql.includes("FROM accounting.journal_entry_postings")) return { rows: [{ exists: true }] };
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

  // ACCT-SETL-BILLPAY-VOID-MIRROR — owner ruling: write BOTH revoked_* AND voided_at/void_reason/
  // voided_by_user_id in the SAME transaction/statement, not a rewrite of the working revoked_*
  // path. Asserted as its own case so a future edit that drops the mirror is a visible test failure,
  // not just a silent gap the existing revoked_at-only assertion above would never catch.
  it("mirrors the GO-22 void register (voided_at/void_reason/voided_by_user_id) in the SAME UPDATE statement as revoked_*, not a second write", async () => {
    const { client, calls } = paymentClient();
    const { voidBillPaymentInClientTx } = await import("../bills.service.js");
    await voidBillPaymentInClientTx(client, {
      operatingCompanyId: COMPANY, paymentId: PAYMENT, reason: "settlement cancellation",
      userId: USER, reversePostedGl: true, currentBusinessDate: "2026-07-18",
    });

    const paymentUpdate = calls.find((call) => call.sql.includes("UPDATE accounting.bill_payments") && call.sql.includes("revoked_at = now()"));
    expect(paymentUpdate, "expected the bill_payments void UPDATE").toBeTruthy();
    // Same statement — not a second, separate UPDATE call.
    expect(paymentUpdate!.sql).toMatch(/revoked_at\s*=\s*now\(\)/);
    expect(paymentUpdate!.sql).toMatch(/voided_at\s*=\s*now\(\)/);
    expect(paymentUpdate!.sql).toMatch(/void_reason\s*=\s*\$4/);
    expect(paymentUpdate!.sql).toMatch(/voided_by_user_id\s*=\s*\$3/);
    // Only ONE bill_payments UPDATE happened — confirms this is a mirror in the existing statement,
    // not a rewrite that fires a second query.
    expect(calls.filter((call) => call.sql.includes("UPDATE accounting.bill_payments")).length).toBe(1);
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

/**
 * LV-BILLVOID-DATE-ERROR-STILL-LIVE (ACCT-F180) — voiding a bill 500s on the reversal date.
 *
 * voidBill() read the bill with a bare SELECT *, so node-postgres returned bill_date as a JS Date.
 * String(billRaw.bill_date).slice(0, 10) then produced "Thu Aug 06" out of
 * "Thu Aug 06 2026 00:00:00 GMT-0500 (Central Daylight Time)", and that reached SQL as a date literal —
 * a 500 on every flag-on bill void. The governance executor never had this bug because it selects
 * bill_date::text explicitly (void-cancel-executors.ts:196).
 *
 * voidBill runs inside withCurrentUser, so rather than stand up a transaction harness these assert the
 * two halves of the fix on the SHIPPED SOURCE, plus the arithmetic of the original expression so
 * nobody restores it believing it worked.
 */
describe("ACCT-F180 — bill void passes a real ISO date to the reversal poster", () => {
  const REAL_BILL_DATE = "2026-08-06";

  it("the query asks for bill_date::text and the date is read from that alias", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../bills.service.ts", import.meta.url), "utf8");

    expect(src).toContain("bill_date::text AS bill_date_iso");
    expect(src).toContain("bill_date_iso");
    // The exact pre-fix expression must be gone — it is what produced "Thu Aug 06".
    expect(src).not.toContain("String(billRaw.bill_date).slice(0, 10)");
    // And the void must REFUSE rather than post a reversal on a malformed date: a reversing entry on
    // the wrong day is worse than a refused void.
    expect(src).toContain("bill_void_bill_date_unreadable");
  });

  it("String(Date).slice(0,10) — the ORIGINAL expression — does not produce a date at all", () => {
    const asDriverReturnsIt = new Date("2026-08-06T00:00:00-05:00");
    expect(String(asDriverReturnsIt).slice(0, 10)).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(asDriverReturnsIt).slice(0, 10)).toBe("Thu Aug 06");
    expect(REAL_BILL_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
