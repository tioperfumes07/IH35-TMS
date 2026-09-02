import { describe, expect, it, vi } from "vitest";

// GO-22 B5 (owner direct instruction, 2026-09-02): "load pays the driver $500, he needs
// $1,000 -> $500 clears the bill payment, $500 becomes a LOAN TO THE DRIVER." Pure unit test —
// DB mocked, no live Neon/USMCA write (Owner law A4: no seat creates money records in USMCA,
// including for proof).

let displayIdCounter = 0;
vi.mock("../display-id.js", () => ({
  nextCashAdvanceDisplayId: vi.fn(async () => `CA-${++displayIdCounter}`),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

const { createDriverCashAdvanceCore } = await import("../cash-advance-create.js");

const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER = "33333333-3333-4333-8333-333333333333";
const BANK = "66666666-6666-4666-8666-666666666666";
const BILL = "77777777-7777-4777-8777-777777777777";

type Captured = {
  liabilityInserts: unknown[][];
  advanceInserts: unknown[][];
};

/** grossAmountCents: what driver_finance.driver_bills reports owed. priorCoveredDollars: sum of
 * non-voided prior advances already linked to it (as the SQL's own COALESCE(SUM(amount)) would
 * read it — dollars, matching driver_advances.amount's numeric type). */
function makeClient(grossAmountCents: number, priorCoveredDollars = 0, billExists = true) {
  const captured: Captured = { liabilityInserts: [], advanceInserts: [] };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: params[0], status: "active" }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: params[0] }] };
      if (sql.includes("FROM driver_finance.driver_bills") && sql.includes("gross_amount_cents")) {
        return billExists ? { rows: [{ gross_amount_cents: grossAmountCents }] } : { rows: [] };
      }
      if (sql.includes("FROM driver_finance.driver_advances") && sql.includes("COALESCE(SUM(amount)")) {
        return { rows: [{ covered: priorCoveredDollars }] };
      }
      if (sql.includes("INSERT INTO driver_finance.driver_liabilities")) {
        captured.liabilityInserts.push(params);
        return { rows: [{ id: `liab-${captured.liabilityInserts.length}` }] };
      }
      if (sql.includes("INSERT INTO driver_finance.deduction_schedule")) return { rows: [] };
      if (sql.includes("INSERT INTO driver_finance.driver_advances")) {
        captured.advanceInserts.push(params);
        return { rows: [{ id: `adv-${captured.advanceInserts.length}` }] };
      }
      if (sql.includes("UPDATE driver_finance.driver_liabilities")) return { rows: [] };
      if (sql.includes("views.cash_advances_with_context")) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, captured };
}

const baseInput = {
  driver_id: DRIVER,
  purpose: "other" as const,
  disbursement_method: "direct_bank_transfer" as const,
  recipient_info: { recipient_type: "driver" as const, bank_reference: "EFT-REF-9001" },
  from_bank_account_id: BANK,
  linked_driver_bill_id: BILL,
};

describe("createDriverCashAdvanceCore — B5 advance/bill-payment/loan overflow split", () => {
  it("request <= bill remaining: unchanged single-row behavior, no split", async () => {
    const { client, captured } = makeClient(50000); // bill owes $500, nothing covered yet
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, { ...baseInput, amount: 300 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.overflow_loan).toBeUndefined();
    expect(captured.advanceInserts).toHaveLength(1);
    expect(captured.liabilityInserts).toHaveLength(1);
    expect(captured.liabilityInserts[0]![2]).toBe("advance"); // type
  });

  it("owner's own example: bill owes $500, driver needs $1,000 -> $500 bill-linked advance + $500 unlinked loan, two separate rows", async () => {
    const { client, captured } = makeClient(50000); // $500.00 owed, nothing covered yet
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, { ...baseInput, amount: 1000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(captured.advanceInserts).toHaveLength(2);
    expect(captured.liabilityInserts).toHaveLength(2);

    // Row 1: the bill-linked portion, capped at $500.
    expect(captured.liabilityInserts[0]![2]).toBe("advance"); // type
    expect(captured.liabilityInserts[0]![4]).toBe(500); // original_amount (dollars)
    expect(captured.advanceInserts[0]![4]).toBe(500); // amount
    expect(captured.advanceInserts[0]![11]).toBe(BILL); // linked_driver_bill_id

    // Row 2: the overflow, booked as a genuinely separate, unlinked loan of $500.
    expect(captured.liabilityInserts[1]![2]).toBe("loan"); // type
    expect(captured.liabilityInserts[1]![4]).toBe(500); // original_amount (dollars)
    expect(captured.advanceInserts[1]![4]).toBe(500); // amount
    expect(captured.advanceInserts[1]![11]).toBe(null); // linked_driver_bill_id — NOT linked

    // The primary result is the bill-linked row; the loan is reported alongside it.
    expect(res.advanceId).toBe("adv-1");
    expect(res.data.overflow_loan).toMatchObject({ advance_id: "adv-2", liability_id: "liab-2", amount_cents: 50000 });
  });

  it("bill already fully covered by a prior advance: the whole request becomes a loan, no bill-linked row at all", async () => {
    const { client, captured } = makeClient(50000, 500); // $500 owed, already fully covered
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, { ...baseInput, amount: 200 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(captured.advanceInserts).toHaveLength(1);
    expect(captured.liabilityInserts[0]![2]).toBe("loan");
    expect(captured.advanceInserts[0]![4]).toBe(200);
    expect(captured.advanceInserts[0]![11]).toBe(null);
    expect(res.data.overflow_loan).toBeNull();
  });

  it("bill partially covered by a prior advance: remaining is netted before splitting", async () => {
    const { client, captured } = makeClient(50000, 300); // $500 owed, $300 already advanced against it
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, { ...baseInput, amount: 400 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Only $200 of bill headroom left -> $200 bill-linked + $200 overflow loan.
    expect(captured.advanceInserts).toHaveLength(2);
    expect(captured.advanceInserts[0]![4]).toBe(200);
    expect(captured.advanceInserts[0]![11]).toBe(BILL);
    expect(captured.advanceInserts[1]![4]).toBe(200);
    expect(captured.advanceInserts[1]![11]).toBe(null);
  });

  it("linked_driver_bill_id pointing at a bill that does not exist (wrong entity/id) fails closed, not silently as a plain loan", async () => {
    const { client } = makeClient(0, 0, false);
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, { ...baseInput, amount: 100 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("linked_driver_bill_not_found");
  });
});
