import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ sql: string; values?: unknown[] }> = [];
const line = { bank_account_id: "ba-1", transaction_date: "2026-10-06", amount_cents: "100000", is_credit: true, review_state: "unreviewed" };
let lineRow: Record<string, unknown> | null = line;
const invoices = [
  { id: "11111111-1111-4111-8111-111111111111", customer_id: "cust-a" },
  { id: "22222222-2222-4222-8222-222222222222", customer_id: "cust-a" },
  { id: "33333333-3333-4333-8333-333333333333", customer_id: "cust-b" },
];
const client = {
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (/FROM banking\.bank_transactions/.test(sql)) return { rows: lineRow ? [lineRow] : [] };
    if (/FROM accounting\.invoices/.test(sql)) return { rows: invoices };
    return { rows: [] };
  }),
};
vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: (fn: (c: unknown) => unknown) => fn(client) }));
const createPayment = vi.fn();
vi.mock("../../payments/customer-payment-create.service.js", () => ({ createCustomerPaymentInClient: (...a: unknown[]) => createPayment(...a) }));
const multi = vi.fn();
vi.mock("../match.service.js", () => ({ acceptMultiDocumentMatchInClient: (...a: unknown[]) => multi(...a) }));

import { planReceipts, ReceiveAndMatchError, receivePaymentsAndMatch } from "../receive-and-match.service.js";

const [A1, A2, B1] = invoices.map((i) => i.id);
const base = { operating_company_id: "co", bank_transaction_id: "bt-1", actor_user_uuid: "u" };

beforeEach(() => {
  calls.length = 0;
  lineRow = line;
  createPayment.mockReset();
  multi.mockReset();
  let n = 0;
  createPayment.mockImplementation(async () => ({ code: 201, data: { id: `pay-${++n}`, display_id: `PMT-2026-0000${n}`, amount_unapplied_cents: 0, applications_count: 1 } }));
  multi.mockResolvedValue({ variance_cents: 0, match_ids: ["m1", "m2"], cleared_matched_column: "matched_payment_id", cleared_ledger_entry_id: "pay-1", difference_journal_entry_id: null });
});

describe("ROUND 433 B8 — planReceipts (pure)", () => {
  const cust = new Map(invoices.map((i) => [i.id, i.customer_id]));
  it("groups by customer and requires the money to close", () => {
    const p = planReceipts(100000, cust, [{ invoice_id: A1, amount_cents: 40000 }, { invoice_id: A2, amount_cents: 10000 }, { invoice_id: B1, amount_cents: 50000 }], null);
    expect(p.applied).toBe(100000);
    expect(p.remainderCents).toBe(0);
    expect(p.byCustomer.get("cust-a")?.amount_cents).toBe(50000);
    expect(p.byCustomer.get("cust-b")?.amount_cents).toBe(50000);
  });
  it("refuses more than the deposit, a duplicate, a homeless remainder, and a remainder home with nothing left", () => {
    expect(() => planReceipts(1000, cust, [{ invoice_id: A1, amount_cents: 1001 }], null)).toThrow(/applications_exceed_bank_amount|Selected/);
    expect(() => planReceipts(1000, cust, [{ invoice_id: A1, amount_cents: 1 }, { invoice_id: A1, amount_cents: 1 }], null)).toThrow("duplicate_invoice_in_applications");
    expect(() => planReceipts(1000, cust, [{ invoice_id: A1, amount_cents: 900 }], null)).toThrow(ReceiveAndMatchError);
    expect(() => planReceipts(1000, cust, [{ invoice_id: A1, amount_cents: 1000 }], { kind: "difference", account_id: "x" })).toThrow("no_remainder_to_place");
  });
  it("a customer credit adds the remainder to that customer's payment as unapplied cash", () => {
    const p = planReceipts(1000, cust, [{ invoice_id: A1, amount_cents: 900 }], { kind: "customer_credit", customer_id: "cust-a" });
    expect(p.byCustomer.get("cust-a")).toEqual({ amount_cents: 1000, applications: [{ invoice_id: A1, amount_cents: 900 }] });
  });
});

describe("ROUND 433 B8 — receivePaymentsAndMatch", () => {
  it("one payment per customer FROM the line (bank account, date, source pointer), then one multi match", async () => {
    const r = await receivePaymentsAndMatch({ ...base, applications: [{ invoice_id: A1, amount_cents: 40000 }, { invoice_id: A2, amount_cents: 10000 }, { invoice_id: B1, amount_cents: 50000 }] });
    expect(createPayment).toHaveBeenCalledTimes(2);
    const first = createPayment.mock.calls[0][2];
    expect(first).toMatchObject({ customer_id: "cust-a", amount_cents: 50000, bank_account_id: "ba-1", received_at: "2026-10-06", payment_source_kind: "bank_feed_match", source_bank_transaction_id: "bt-1" });
    expect(first.applications).toHaveLength(2);
    expect(multi.mock.calls[0][1]).toMatchObject({ entries: [{ ledger_entry_kind: "payment", ledger_entry_id: "pay-1" }, { ledger_entry_kind: "payment", ledger_entry_id: "pay-2" }], difference_account_id: null });
    expect(r.payments).toHaveLength(2);
    expect(calls.some((c) => /FOR UPDATE/.test(c.sql))).toBe(true);
  });
  it("a remainder to a named difference account goes to the multi accept's difference poster", async () => {
    await receivePaymentsAndMatch({ ...base, applications: [{ invoice_id: B1, amount_cents: 90000 }], remainder: { kind: "difference", account_id: "acct-misc" } });
    expect(createPayment.mock.calls[0][2].amount_cents).toBe(90000);
    expect(multi.mock.calls[0][1].difference_account_id).toBe("acct-misc");
  });
  it("refuses money out, an already-matched line, and stops (throws -> rollback) when a payment is refused", async () => {
    lineRow = { ...line, is_credit: false };
    await expect(receivePaymentsAndMatch({ ...base, applications: [{ invoice_id: A1, amount_cents: 1 }] })).rejects.toThrow(/deposit/);
    lineRow = { ...line, review_state: "matched" };
    await expect(receivePaymentsAndMatch({ ...base, applications: [{ invoice_id: A1, amount_cents: 1 }] })).rejects.toThrow("bank_transaction_already_matched");
    lineRow = line;
    createPayment.mockResolvedValueOnce({ code: 400, error: "apply_amount_exceeds_invoice_open" });
    await expect(receivePaymentsAndMatch({ ...base, applications: [{ invoice_id: A1, amount_cents: 100000 }] })).rejects.toThrow("apply_amount_exceeds_invoice_open");
    expect(multi).not.toHaveBeenCalled();
  });
});
