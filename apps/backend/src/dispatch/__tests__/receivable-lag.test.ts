import { describe, it, expect } from "vitest";
import {
  receivableLagDays,
  projectedCashDate,
  FACTORING_ADVANCE_DAYS,
  DEFAULT_NET_TERMS_DAYS,
} from "../receivable-lag.js";

// Owner ruling 2026-09-28, verbatim: "THE PROJECTIONS ARE ON THE PROJECTED PURCHASES OF INVOICES
// BY FARO. THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE."
// This SUPERSEDES the 2026-06-17 rule. The lag is zero. Do not re-introduce a non-zero lag.
describe("receivableLagDays — delivery date IS the projected income date (owner 2026-09-28)", () => {
  it("is zero for factored loads regardless of customer terms", () => {
    expect(receivableLagDays({ is_factored: true, customer_net_days: 45 })).toBe(0);
    expect(receivableLagDays({ is_factored: true, customer_net_days: null })).toBe(0);
  });

  it("is zero for non-factored loads too", () => {
    expect(receivableLagDays({ is_factored: false, customer_net_days: 21 })).toBe(0);
    expect(receivableLagDays({ is_factored: false, customer_net_days: 60 })).toBe(0);
    expect(receivableLagDays({ is_factored: false, customer_net_days: null })).toBe(0);
  });

  it("the exported constants are zero — a non-zero value shifts the owner's cash flow", () => {
    expect(FACTORING_ADVANCE_DAYS).toBe(0);
    expect(DEFAULT_NET_TERMS_DAYS).toBe(0);
  });

  it("never returns non-zero for any input", () => {
    for (const is_factored of [true, false]) {
      for (const customer_net_days of [null, 0, 1, 30, 90]) {
        expect(receivableLagDays({ is_factored, customer_net_days })).toBe(0);
      }
    }
  });
});

describe("projectedCashDate — the delivery date itself", () => {
  it("projects cash on the delivery date when the lag is zero", () => {
    expect(projectedCashDate("2026-09-28T00:00:00.000Z", 0)).toBe("2026-09-28T00:00:00.000Z");
  });

  it("a 1-day delivery slip moves projected cash by exactly 1 day", () => {
    expect(projectedCashDate("2026-09-28T00:00:00.000Z", 0)).toBe("2026-09-28T00:00:00.000Z");
    expect(projectedCashDate("2026-09-29T00:00:00.000Z", 0)).toBe("2026-09-29T00:00:00.000Z");
  });

  it("returns null without an effective delivery date", () => {
    expect(projectedCashDate(null, 0)).toBeNull();
    expect(projectedCashDate(undefined, 0)).toBeNull();
  });
});
