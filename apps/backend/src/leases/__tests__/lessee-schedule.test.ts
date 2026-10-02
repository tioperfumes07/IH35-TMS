import { describe, expect, it } from "vitest";
import { buildLesseeSchedule, classifyLessee, type LesseeSchedule } from "../lessee-schedule.js";

function invariants(s: LesseeSchedule, option = 0) {
  for (const p of s.periods) {
    expect(p.principal_cents).toBe(p.payment_cents - p.interest_cents);
    expect(p.liability_close_cents).toBe(p.liability_open_cents - p.principal_cents);
    expect(p.lease_cost_cents).toBe(p.interest_cents + p.rou_amortization_cents);
  }
  for (let i = 1; i < s.periods.length; i++) expect(s.periods[i].liability_open_cents).toBe(s.periods[i - 1].liability_close_cents);
  expect(s.liability_final_cents).toBe(option);
  const totalInterest = s.periods.reduce((a, p) => a + p.interest_cents, 0);
  const totalPay = s.periods.reduce((a, p) => a + p.payment_cents, 0);
  expect(totalInterest).toBe(totalPay + option - s.liability_initial_cents);
}

describe("ROUND 321 lease-to-own lessee schedule (ASC 842)", () => {
  it("classifies by the owner's B1 rule: FMV -> operating, fixed price -> finance, none -> operating", () => {
    expect(classifyLessee("fmv")).toBe("operating");
    expect(classifyLessee("fixed")).toBe("finance");
    expect(classifyLessee("none")).toBe("operating");
    expect(classifyLessee(null)).toBe("operating");
  });

  it("finance: PV of 36 advance payments of $2,500 at 8% + $10,000 buyout; liability closes at the buyout, ROU at zero", () => {
    const s = buildLesseeSchedule({ commencement: "2026-01-01", periods: 36, baseMonthlyCents: 250_000, annualRateBps: 800, classification: "finance", purchaseOptionCents: 1_000_000 });
    // annuity-due PV: 2500 * (1 - 1.0066667^-36) / 0.0066667 * 1.0066667 + 10000 * 1.0066667^-36
    const r = 0.08 / 12;
    const expected = Math.round(250_000 * ((1 - Math.pow(1 + r, -36)) / r) * (1 + r) + 1_000_000 * Math.pow(1 + r, -36));
    expect(s.liability_initial_cents).toBe(expected);
    expect(s.rou_initial_cents).toBe(expected);
    invariants(s, 1_000_000);
    expect(s.rou_final_cents).toBe(0);
    // period 1: payment in advance, interest on (PV - payment)
    expect(s.periods[0].interest_cents).toBe(Math.round((expected - 250_000) * r));
  });

  it("finance with a useful life longer than the term leaves the unamortized ROU for the buyout to move to fixed assets", () => {
    const s = buildLesseeSchedule({ commencement: "2026-01-01", periods: 24, baseMonthlyCents: 300_000, annualRateBps: 900, classification: "finance", purchaseOptionCents: 500_000, usefulLifeMonths: 60 });
    invariants(s, 500_000);
    expect(s.rou_final_cents).toBe(s.rou_initial_cents - Math.trunc(s.rou_initial_cents / 60) * 24);
  });

  it("operating (FMV option): straight-line lease cost, liability and ROU both close at zero", () => {
    const s = buildLesseeSchedule({ commencement: "2026-03-01", periods: 48, baseMonthlyCents: 210_000, annualRateBps: 750, classification: "operating", purchaseOptionCents: 999_999 });
    invariants(s, 0);
    expect(s.rou_final_cents).toBe(0);
    const costs = new Set(s.periods.slice(0, -1).map((p) => p.lease_cost_cents));
    expect([...costs]).toEqual([210_000]);
  });

  it("operating with escalation: lease cost is the straight-line average of the escalated payments", () => {
    const s = buildLesseeSchedule({ commencement: "2026-01-01", periods: 36, baseMonthlyCents: 200_000, escalationBps: 300, escalationEveryMonths: 12, annualRateBps: 800, classification: "operating" });
    invariants(s, 0);
    expect(s.rou_final_cents).toBe(0);
    expect(s.periods[12].payment_cents).toBe(206_000);
    expect(s.periods[24].payment_cents).toBe(212_180);
    const total = s.periods.reduce((a, p) => a + p.payment_cents, 0);
    expect(s.periods.reduce((a, p) => a + p.lease_cost_cents, 0)).toBe(total);
  });

  it("zero rate: liability = sum of payments, no interest", () => {
    const s = buildLesseeSchedule({ commencement: "2026-01-01", periods: 12, baseMonthlyCents: 100_000, annualRateBps: 0, classification: "operating" });
    expect(s.liability_initial_cents).toBe(1_200_000);
    expect(s.periods.every((p) => p.interest_cents === 0)).toBe(true);
    invariants(s, 0);
  });

  it("refuses an unusable input instead of guessing", () => {
    expect(() => buildLesseeSchedule({ commencement: "2026-01-15", periods: 12, baseMonthlyCents: 1, annualRateBps: 0, classification: "operating" })).toThrow(/first_of_month/);
    expect(() => buildLesseeSchedule({ commencement: "2026-01-01", periods: 0, baseMonthlyCents: 1, annualRateBps: 0, classification: "operating" })).toThrow(/periods/);
  });
});
