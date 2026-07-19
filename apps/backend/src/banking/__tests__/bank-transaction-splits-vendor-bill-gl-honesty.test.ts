/**
 * Pure honesty gate for vendor-bill split GL completeness — no DB.
 * Locks evaluateVendorBillGlCompleteness against poster-leg outputs (atomic path).
 */
import { describe, expect, it } from "vitest";
import { evaluateVendorBillGlCompleteness } from "../bank-transaction-splits.service.js";

const okLeg = (type: "bill" | "bill_payment", id: string) => ({
  result: "posted" as const,
  journal_entry_id: `je-${type}`,
  journal_entry_posting_ids: [`p1-${type}`, `p2-${type}`],
  source_transaction_type: type,
  source_transaction_id: id,
});

describe("evaluateVendorBillGlCompleteness (vendor-bill split GL honesty)", () => {
  it("accepts only when both poster legs posted with JE + ≥2 posting ids", () => {
    expect(
      evaluateVendorBillGlCompleteness({
        bill: okLeg("bill", "b1"),
        bill_payment: okLeg("bill_payment", "p1"),
      })
    ).toEqual({ ok: true });
  });

  it("rejects missing result / incomplete legs", () => {
    expect(evaluateVendorBillGlCompleteness(null)).toEqual({
      ok: false,
      reason: "gl_post_missing_result",
    });
    expect(
      evaluateVendorBillGlCompleteness({
        bill: null,
        bill_payment: okLeg("bill_payment", "p1"),
      })
    ).toEqual({ ok: false, reason: "bill_gl_not_posted" });
    expect(
      evaluateVendorBillGlCompleteness({
        bill: okLeg("bill", "b1"),
        bill_payment: {
          ...okLeg("bill_payment", "p1"),
          journal_entry_posting_ids: ["only-one"],
        },
      })
    ).toEqual({ ok: false, reason: "bill_payment_gl_not_posted" });
  });

  it("surfaces poster error", () => {
    expect(
      evaluateVendorBillGlCompleteness({
        error: "ACCOUNT_MAPPING_MISSING: AP account mapping is missing",
      })
    ).toEqual({
      ok: false,
      reason: "gl_post_failed:ACCOUNT_MAPPING_MISSING: AP account mapping is missing",
    });
  });
});
