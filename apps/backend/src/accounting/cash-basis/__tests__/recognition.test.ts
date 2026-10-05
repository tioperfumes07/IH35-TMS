import { describe, expect, it } from "vitest";
import { recognizeCashBasis, type SettlementEvent } from "../recognition";

/**
 * ACCT-F412 — every case here is a thing QuickBooks does, asserted as a number.
 * The headline case is the one the old transform got wrong every single time: an UNPAID invoice
 * must contribute ZERO to a cash-basis P&L.
 */

const Q1 = { from: "2026-01-01", to: "2026-03-31" };

describe("ACCT-F412 — an unpaid document recognizes NOTHING", () => {
  it("defers the whole posting when nothing has settled", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(0);
    expect(r.recognizedThroughToCents).toBe(0);
    expect(r.deferredCents).toBe(100_000);
    expect(r.reason).toBe("unsettled");
  });

  it("is the exact case the old transform got wrong: it kept 100000 of 100000", () => {
    // profit-loss.routes.ts passed anchorDate as the settlement_date, so the engine recognized
    // every line in full, always. This asserts the corrected answer, as a number.
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [],
      ...Q1,
    });
    expect(r.recognizedCents).not.toBe(100_000);
    expect(r.recognizedCents).toBe(0);
  });
});

describe("ACCT-F412 — a PARTIAL payment recognizes PRO RATA", () => {
  it("$250 received on a $1,000 invoice recognizes $250, not $1,000 and not $0", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [{ date: "2026-03-15", amount_cents: 25_000 }],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(25_000);
    expect(r.deferredCents).toBe(75_000);
    expect(r.reason).toBe("partially_settled");
  });

  it("recognizes a LINE's own share, not the whole invoice's payment", () => {
    // One $400 line of a $1,000 invoice, half the invoice paid -> $200 of THIS line.
    const r = recognizeCashBasis({
      postingAmountCents: 40_000,
      documentTotalCents: 100_000,
      settlements: [{ date: "2026-02-01", amount_cents: 50_000 }],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(20_000);
    expect(r.deferredCents).toBe(20_000);
  });
});

describe("ACCT-F412 — recognition lands in the PAYMENT's period, not the invoice's", () => {
  it("a Q1 invoice paid in Q2 contributes NOTHING to Q1", () => {
    const paidInQ2: SettlementEvent[] = [{ date: "2026-05-10", amount_cents: 100_000 }];
    const q1 = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: paidInQ2,
      ...Q1,
    });
    expect(q1.recognizedCents).toBe(0);
    expect(q1.deferredCents).toBe(100_000); // still deferred as of 2026-03-31

    const q2 = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: paidInQ2,
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(q2.recognizedCents).toBe(100_000);
    expect(q2.deferredCents).toBe(0);
  });

  it("splits one invoice across two periods when it was paid in two installments", () => {
    const two: SettlementEvent[] = [
      { date: "2026-03-20", amount_cents: 60_000 },
      { date: "2026-04-20", amount_cents: 40_000 },
    ];
    const q1 = recognizeCashBasis({ postingAmountCents: 100_000, documentTotalCents: 100_000, settlements: two, ...Q1 });
    const q2 = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: two,
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(q1.recognizedCents).toBe(60_000);
    expect(q2.recognizedCents).toBe(40_000);
    // The two periods together equal the accrual figure exactly — no cent invented or lost.
    expect(q1.recognizedCents + q2.recognizedCents).toBe(100_000);
  });
});

describe("ACCT-F412 — paid by VALUE, not by new money (Intuit's own wording)", () => {
  it("a credit memo settles like a payment, because it reduces the receivable", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [{ date: "2026-02-14", amount_cents: 100_000 }],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(100_000);
    expect(r.reason).toBe("fully_settled");
  });

  it("an OVERPAYMENT settles the document and no more — it never invents income", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [{ date: "2026-02-01", amount_cents: 150_000 }],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(100_000);
    expect(r.recognizedCents).not.toBe(150_000);
    expect(r.deferredCents).toBe(0);
  });
});

describe("ACCT-F412 — the parts must sum to the accrual figure, to the cent", () => {
  it("three uneven payments on an indivisible amount still sum exactly", () => {
    // 100_001 does not divide by 3. Without the last-event remainder rule this drifts a cent and
    // the cash column stops tying to the ledger.
    const r = recognizeCashBasis({
      postingAmountCents: 100_001,
      documentTotalCents: 100_001,
      settlements: [
        { date: "2026-01-10", amount_cents: 33_333 },
        { date: "2026-02-10", amount_cents: 33_334 },
        { date: "2026-03-10", amount_cents: 33_334 },
      ],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(100_001);
    expect(r.deferredCents).toBe(0);
  });

  it("is order-independent — the database's row order cannot change which period gets what", () => {
    const events: SettlementEvent[] = [
      { date: "2026-04-20", amount_cents: 40_000 },
      { date: "2026-03-20", amount_cents: 60_000 },
    ];
    const forward = recognizeCashBasis({ postingAmountCents: 100_000, documentTotalCents: 100_000, settlements: events, ...Q1 });
    const reversed = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 100_000,
      settlements: [...events].reverse(),
      ...Q1,
    });
    expect(forward.recognizedCents).toBe(reversed.recognizedCents);
    expect(forward.recognizedCents).toBe(60_000);
  });
});

describe("ACCT-F412 — a document with no total is a QUESTION, not a number", () => {
  it("never assumes settled, and never silently folds a guess into a total", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 100_000,
      documentTotalCents: 0,
      settlements: [{ date: "2026-02-01", amount_cents: 50_000 }],
      ...Q1,
    });
    expect(r.reason).toBe("undefined_proportion");
    expect(r.recognizedCents).toBe(0);
    expect(r.deferredCents).toBe(100_000);
  });
});

describe("ACCT-F412 — expenses use the identical rule, mirrored", () => {
  it("an unpaid BILL is not an expense yet on a cash basis", () => {
    const r = recognizeCashBasis({ postingAmountCents: 80_000, documentTotalCents: 80_000, settlements: [], ...Q1 });
    expect(r.recognizedCents).toBe(0);
    expect(r.deferredCents).toBe(80_000);
  });

  it("a bill paid half recognizes half the expense, in the payment's period", () => {
    const r = recognizeCashBasis({
      postingAmountCents: 80_000,
      documentTotalCents: 80_000,
      settlements: [{ date: "2026-03-01", amount_cents: 40_000 }],
      ...Q1,
    });
    expect(r.recognizedCents).toBe(40_000);
    expect(r.deferredCents).toBe(40_000);
  });
});
