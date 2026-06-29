// FIN-21 — pure math unit tests (no Postgres). Provable in every environment.
import { describe, expect, it } from "vitest";
import {
  AmortizationPostingError,
  assertBalanced,
  buildDepreciationIdempotencyKey,
  buildPrepaidAmortizationIdempotencyKey,
} from "./amortization-posting.math.js";
import { computeDepreciationSchedule } from "../fixed-assets.math.js";

describe("FIN-21 idempotency keys", () => {
  it("prepaid key is deterministic + lowercased + carries the period", () => {
    const k = buildPrepaidAmortizationIdempotencyKey("ABC-123", "DEF-456", 7);
    expect(k).toBe("ih35:prepaid-amort:v1:abc-123:def-456:7");
  });
  it("depreciation key is distinct from the prepaid key for the same asset/period", () => {
    const p = buildPrepaidAmortizationIdempotencyKey("o", "a", 1);
    const d = buildDepreciationIdempotencyKey("o", "a", 1);
    expect(d).toBe("ih35:depreciation:v1:o:a:1");
    expect(d).not.toBe(p);
  });
});

describe("FIN-21 assertBalanced", () => {
  it("passes when debits == credits > 0", () => {
    expect(() => assertBalanced([
      { debit_or_credit: "debit", amount_cents: 5000 },
      { debit_or_credit: "credit", amount_cents: 5000 },
    ])).not.toThrow();
  });
  it("throws UNBALANCED_ENTRY when sides differ", () => {
    try {
      assertBalanced([
        { debit_or_credit: "debit", amount_cents: 5000 },
        { debit_or_credit: "credit", amount_cents: 4000 },
      ]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AmortizationPostingError);
      expect((e as AmortizationPostingError).code).toBe("UNBALANCED_ENTRY");
    }
  });
  it("throws when both sides are zero", () => {
    expect(() => assertBalanced([
      { debit_or_credit: "debit", amount_cents: 0 },
      { debit_or_credit: "credit", amount_cents: 0 },
    ])).toThrow(AmortizationPostingError);
  });
});

describe("FIN-21 depreciation schedule (shared compute)", () => {
  it("straight_line full_month sums to the depreciable base and respects salvage", () => {
    const { rows } = computeDepreciationSchedule({
      purchase_price_cents: 120000,
      salvage_value_cents: 0,
      in_service_date: "2026-01-01",
      method: "straight_line",
      useful_life_months: 12,
      convention: "full_month",
      prior_accumulated_depr_cents: 0,
    });
    expect(rows.length).toBe(12);
    const total = rows.reduce((s, r) => s + r.depreciation_amount_cents, 0);
    expect(total).toBe(120000);
    expect(rows[rows.length - 1].accumulated_to_date_cents).toBe(120000);
    expect(rows[rows.length - 1].book_value_end_cents).toBe(0);
  });

  it("salvage reduces the depreciable base (sums to cost - salvage)", () => {
    const { rows } = computeDepreciationSchedule({
      purchase_price_cents: 100000,
      salvage_value_cents: 10000,
      in_service_date: "2026-01-01",
      method: "straight_line",
      useful_life_months: 10,
      convention: "full_month",
      prior_accumulated_depr_cents: 0,
    });
    const total = rows.reduce((s, r) => s + r.depreciation_amount_cents, 0);
    expect(total).toBe(90000);
    expect(rows[rows.length - 1].book_value_end_cents).toBe(10000); // floored at salvage
  });

  it("half_month convention halves the first period and adds a stub period", () => {
    const { rows } = computeDepreciationSchedule({
      purchase_price_cents: 120000,
      salvage_value_cents: 0,
      in_service_date: "2026-01-01",
      method: "half_month",
      useful_life_months: 12,
      convention: "half_month",
      prior_accumulated_depr_cents: 0,
    });
    expect(rows.length).toBe(13); // life + 1 stub
    expect(rows[0].depreciation_amount_cents).toBe(5000); // half of 10000 monthly
    const total = rows.reduce((s, r) => s + r.depreciation_amount_cents, 0);
    expect(total).toBe(120000); // base still fully allocated
  });

  it("respects prior_accumulated_depr_cents — accumulated rolls forward from the prior balance", () => {
    const { rows } = computeDepreciationSchedule({
      purchase_price_cents: 120000,
      salvage_value_cents: 0,
      in_service_date: "2026-01-01",
      method: "straight_line",
      useful_life_months: 12,
      convention: "full_month",
      prior_accumulated_depr_cents: 50000,
    });
    // First period's accumulated-to-date = prior (50000) + this period's depreciation (10000).
    expect(rows[0].accumulated_to_date_cents).toBe(60000);
    // Book value starts from cost - prior (70000), never from full cost.
    expect(rows[0].book_value_end_cents).toBe(60000);
  });
});
