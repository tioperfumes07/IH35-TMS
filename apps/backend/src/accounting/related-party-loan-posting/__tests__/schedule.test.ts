/**
 * LOAN-04 — schedule generation. The properties that matter are the ones a borrower could dispute.
 *
 * Every assertion here is about a number someone repays: does the schedule sum to what was borrowed,
 * does it end at exactly zero, does a 0% loan stay 0% . A schedule that is "about right" is a schedule
 * that produces a cent of unexplained residual balance on the final payment, and that cent is the one a
 * related party will ask about in a Chapter 11 proceeding.
 */
import { describe, expect, it } from "vitest";

import { buildLoanSchedule } from "../schedule.service.js";

const BASE = { firstPaymentDate: "2026-09-01" };

describe("buildLoanSchedule", () => {
  it("principal always sums to EXACTLY the amount borrowed (no lost or invented cent)", () => {
    for (const [principal, count, bps] of [
      [100_000, 12, 600],
      [999_999, 7, 1250],
      [1, 1, 0],
      [250_000, 24, 0],
      [333_333, 3, 999],
    ] as const) {
      const rows = buildLoanSchedule({
        ...BASE,
        principalCents: principal,
        interestRateBps: bps,
        paymentFrequency: "monthly",
        paymentCount: count,
      });
      const sum = rows.reduce((t, r) => t + r.principal_cents, 0);
      expect(sum).toBe(principal);
    }
  });

  it("ends at EXACTLY zero — the final period absorbs rounding", () => {
    const rows = buildLoanSchedule({
      ...BASE,
      principalCents: 999_999,
      interestRateBps: 1250,
      paymentFrequency: "monthly",
      paymentCount: 7,
    });
    expect(rows[rows.length - 1].remaining_balance_cents).toBe(0);
  });

  it("a 0% loan charges ZERO interest — an owner lending at 0% must not accrue any", () => {
    const rows = buildLoanSchedule({
      ...BASE,
      principalCents: 120_000,
      interestRateBps: 0,
      paymentFrequency: "monthly",
      paymentCount: 12,
    });
    expect(rows.reduce((t, r) => t + r.interest_cents, 0)).toBe(0);
    expect(rows.reduce((t, r) => t + r.principal_cents, 0)).toBe(120_000);
  });

  it("emits exactly the requested number of payments", () => {
    for (const count of [1, 3, 12, 60]) {
      const rows = buildLoanSchedule({
        ...BASE,
        principalCents: 500_000,
        interestRateBps: 500,
        paymentFrequency: "monthly",
        paymentCount: count,
      });
      expect(rows).toHaveLength(count);
      expect(rows.map((r) => r.payment_number)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    }
  });

  it("every row is whole cents and non-negative — no floats reach the schedule", () => {
    const rows = buildLoanSchedule({
      ...BASE,
      principalCents: 777_777,
      interestRateBps: 733,
      paymentFrequency: "monthly",
      paymentCount: 9,
    });
    for (const r of rows) {
      for (const v of [r.payment_cents, r.principal_cents, r.interest_cents, r.remaining_balance_cents]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(r.payment_cents).toBe(r.principal_cents + r.interest_cents);
    }
  });

  it("lump_sum is ONE balloon row that still returns the whole principal", () => {
    const rows = buildLoanSchedule({
      ...BASE,
      principalCents: 300_000,
      interestRateBps: 1000,
      paymentFrequency: "lump_sum",
      paymentCount: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].principal_cents).toBe(300_000);
    expect(rows[0].interest_cents).toBe(30_000);
    expect(rows[0].payment_cents).toBe(330_000);
    expect(rows[0].remaining_balance_cents).toBe(0);
  });

  it("per_settlement keeps the split real but does NOT invent a payment calendar", () => {
    // Settlements happen when loads finish, not on dates. Asserting due dates here would put an
    // authoritative-looking calendar on a schedule nothing pays to.
    const rows = buildLoanSchedule({
      ...BASE,
      principalCents: 200_000,
      interestRateBps: 0,
      paymentFrequency: "per_settlement",
      paymentCount: 4,
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.due_date))).toEqual(new Set(["2026-09-01"]));
    expect(rows.reduce((t, r) => t + r.principal_cents, 0)).toBe(200_000);
  });

  it("weekly and biweekly advance on their own cadence, not monthly", () => {
    const weekly = buildLoanSchedule({
      ...BASE, principalCents: 100_000, interestRateBps: 0, paymentFrequency: "weekly", paymentCount: 3,
    });
    expect(weekly.map((r) => r.due_date)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15"]);

    const biweekly = buildLoanSchedule({
      ...BASE, principalCents: 100_000, interestRateBps: 0, paymentFrequency: "biweekly", paymentCount: 3,
    });
    expect(biweekly.map((r) => r.due_date)).toEqual(["2026-09-01", "2026-09-15", "2026-09-29"]);
  });

  it("monthly preserves day-of-month across a short month instead of drifting 30 days", () => {
    const rows = buildLoanSchedule({
      firstPaymentDate: "2026-01-31",
      principalCents: 100_000,
      interestRateBps: 0,
      paymentFrequency: "monthly",
      paymentCount: 3,
    });
    // February clamps to the last valid day; March returns to the 31st.
    expect(rows.map((r) => r.due_date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("refuses a non-positive or non-integer principal rather than emitting a nonsense schedule", () => {
    for (const bad of [0, -1, 10.5]) {
      expect(() =>
        buildLoanSchedule({ ...BASE, principalCents: bad, interestRateBps: 0, paymentFrequency: "monthly", paymentCount: 3 })
      ).toThrow();
    }
  });
});
