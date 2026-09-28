import { describe, it, expect } from "vitest";
import {
  receivableLagDays,
  projectedCashDate,
  FACTORING_ADVANCE_DAYS,
  DEFAULT_NET_TERMS_DAYS,
} from "../receivable-lag.js";

describe("receivableLagDays — ROUND 195.1 owner law (2026-09-28): factored loads have zero lag", () => {
  it("factored loads have zero lag (Faro buys at delivery — never net terms)", () => {
    expect(receivableLagDays({ is_factored: true, customer_net_days: 45 })).toBe(FACTORING_ADVANCE_DAYS);
    expect(receivableLagDays({ is_factored: true, customer_net_days: null })).toBe(FACTORING_ADVANCE_DAYS);
    expect(FACTORING_ADVANCE_DAYS).toBe(0);
  });

  it("non-factored loads use the customer's net terms", () => {
    expect(receivableLagDays({ is_factored: false, customer_net_days: 21 })).toBe(21);
    expect(receivableLagDays({ is_factored: false, customer_net_days: 60 })).toBe(60);
  });

  it("falls back to NET-30 (never zero) when a non-factored customer has no terms", () => {
    expect(receivableLagDays({ is_factored: false, customer_net_days: null })).toBe(DEFAULT_NET_TERMS_DAYS);
    expect(receivableLagDays({ is_factored: false, customer_net_days: 0 })).toBe(DEFAULT_NET_TERMS_DAYS);
  });

  it("non-factored loads never return zero; factored loads always return zero", () => {
    for (const customer_net_days of [null, 0, 1, 30, 90]) {
      expect(receivableLagDays({ is_factored: false, customer_net_days })).toBeGreaterThan(0);
      expect(receivableLagDays({ is_factored: true, customer_net_days })).toBe(0);
    }
  });
});

describe("projectedCashDate — delivery + lag", () => {
  it("a 1-day delivery slip moves projected cash by exactly 1 day (lag preserved)", () => {
    const sched = projectedCashDate("2026-06-16T00:00:00.000Z", 1);
    const slip = projectedCashDate("2026-06-17T00:00:00.000Z", 1);
    expect(sched).toBe("2026-06-17T00:00:00.000Z");
    expect(slip).toBe("2026-06-18T00:00:00.000Z");
  });

  it("adds the receivable lag in days", () => {
    expect(projectedCashDate("2026-06-16T00:00:00.000Z", 30)).toBe("2026-07-16T00:00:00.000Z");
  });

  it("returns null without an effective delivery date", () => {
    expect(projectedCashDate(null, 30)).toBeNull();
    expect(projectedCashDate(undefined, 1)).toBeNull();
  });

  it("ROUND 195.1: zero lag (a factored load) returns the raw delivery date unchanged", () => {
    expect(projectedCashDate("2026-06-16T00:00:00.000Z", FACTORING_ADVANCE_DAYS)).toBe("2026-06-16T00:00:00.000Z");
  });
});
