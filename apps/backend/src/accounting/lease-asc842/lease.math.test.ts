// FIN-22 — pure schedule/balance math unit tests (no DB). Prove the amortization invariants that the GL
// posting relies on: per period payment == principal + interest, SUM(principal) == commencement receivable,
// SUM(interest) == total payments - PV, and the operating schedule recognizes rental income == payment.
import { describe, it, expect } from "vitest";
import {
  generateSchedule,
  salesTypeReceivableCents,
  presentValueCents,
  buildLeaseIdempotencyKey,
  assertBalanced,
  LeasePostingError,
} from "./lease.math.js";

describe("operating schedule", () => {
  it("recognizes rental income == payment each period, no interest/principal/receivable", () => {
    const rows = generateSchedule({
      election: "operating",
      commencement_date: "2026-01-01",
      payment_amount_cents: 250000,
      payment_frequency: "monthly",
      number_of_periods: 12,
      discount_rate_bps: null,
    });
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      expect(r.rental_income_cents).toBe(250000);
      expect(r.payment_cents).toBe(250000);
      expect(r.interest_cents).toBe(0);
      expect(r.principal_cents).toBe(0);
      expect(r.receivable_balance_cents).toBe(0);
    }
    expect(salesTypeReceivableCents(rows)).toBe(0);
  });
});

describe("sales-type schedule (effective interest)", () => {
  it("zero rate => all principal, zero interest, receivable == total payments", () => {
    const rows = generateSchedule({
      election: "sales_type",
      commencement_date: "2026-01-01",
      payment_amount_cents: 100000,
      payment_frequency: "monthly",
      number_of_periods: 10,
      discount_rate_bps: 0,
    });
    expect(rows).toHaveLength(10);
    expect(salesTypeReceivableCents(rows)).toBe(1000000);
    for (const r of rows) {
      expect(r.interest_cents).toBe(0);
      expect(r.principal_cents).toBe(100000);
      expect(r.payment_cents).toBe(r.principal_cents + r.interest_cents);
    }
    expect(rows[rows.length - 1]!.receivable_balance_cents).toBe(0);
  });

  it("positive rate => payment == principal + interest each period; SUM(principal) == PV; ends at zero", () => {
    const payment = 100000;
    const n = 24;
    const bps = 600; // 6% annual
    const rows = generateSchedule({
      election: "sales_type",
      commencement_date: "2026-01-01",
      payment_amount_cents: payment,
      payment_frequency: "monthly",
      number_of_periods: n,
      discount_rate_bps: bps,
    });
    const pv = presentValueCents(payment, n, 600 / 10000 / 12);
    expect(salesTypeReceivableCents(rows)).toBe(pv);
    let interestTotal = 0;
    for (const r of rows) {
      expect(r.payment_cents).toBe(r.principal_cents + r.interest_cents);
      expect(r.interest_cents).toBeGreaterThanOrEqual(0);
      expect(r.principal_cents).toBeGreaterThanOrEqual(0);
      interestTotal += r.interest_cents;
    }
    expect(rows[rows.length - 1]!.receivable_balance_cents).toBe(0);
    // Total interest income == total payments - PV (financing income).
    expect(interestTotal).toBe(payment * n - pv);
  });
});

describe("helpers", () => {
  it("idempotency key is deterministic + lowercased", () => {
    const a = buildLeaseIdempotencyKey("AbC", "DeF", "rental", 3);
    expect(a).toBe("ih35:lease-gl:v1:abc:def:rental:3");
    expect(buildLeaseIdempotencyKey("AbC", "DeF", "disposal", null)).toBe("ih35:lease-gl:v1:abc:def:disposal:-");
  });

  it("assertBalanced rejects unbalanced / zero entries", () => {
    expect(() => assertBalanced([{ debit_or_credit: "debit", amount_cents: 100 }, { debit_or_credit: "credit", amount_cents: 90 }])).toThrow(LeasePostingError);
    expect(() => assertBalanced([{ debit_or_credit: "debit", amount_cents: 0 }, { debit_or_credit: "credit", amount_cents: 0 }])).toThrow(LeasePostingError);
    expect(() => assertBalanced([{ debit_or_credit: "debit", amount_cents: 100 }, { debit_or_credit: "credit", amount_cents: 100 }])).not.toThrow();
  });
});
