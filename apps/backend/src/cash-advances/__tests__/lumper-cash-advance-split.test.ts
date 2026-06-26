import { describe, expect, it } from "vitest";
import {
  type AdvanceSplit,
  lumperLifecycleEnabled,
  validateAdvanceSplit,
} from "../lumper-cash-advance-split";

describe("lumper-cash-advance-split — STEP 3b validation (the $400 split contract)", () => {
  const split400: AdvanceSplit[] = [
    { kind: "bill_payment", amount_cents: 25000, bill_id: "b1" },
    { kind: "lumper_expense", amount_cents: 15000, load_id: "l1", billable_customer_uuid: "c1" },
  ];

  it("accepts $250 + $150 = $400 (legs sum to the advance)", () => {
    expect(validateAdvanceSplit(split400, 40000)).toEqual({ ok: true });
  });

  it("FAILS LOUD when legs do not sum to the advance ($400 split vs $300 advance)", () => {
    const r = validateAdvanceSplit(split400, 30000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("split_sum_mismatch");
      expect(r.message).toContain("40000");
      expect(r.message).toContain("30000");
    }
  });

  it("rejects an empty split", () => {
    const r = validateAdvanceSplit([], 40000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("empty_split");
  });

  it("rejects a non-positive or non-integer leg amount (no negative/garbage money)", () => {
    expect(validateAdvanceSplit([{ kind: "bill_payment", amount_cents: 0, bill_id: "b" }], 0).ok).toBe(false);
    expect(validateAdvanceSplit([{ kind: "bill_payment", amount_cents: -100, bill_id: "b" }], -100).ok).toBe(false);
    const frac = validateAdvanceSplit([{ kind: "lumper_expense", amount_cents: 150.5, load_id: "l" }], 150);
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.error).toBe("invalid_split_amount");
  });

  it("rejects a non-positive advance total", () => {
    const r = validateAdvanceSplit(split400, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_advance_total");
  });

  it("feature flag is OFF by default (no lumper money behavior without explicit enable)", () => {
    const prev = process.env.LUMPER_LIFECYCLE_ENABLED;
    delete process.env.LUMPER_LIFECYCLE_ENABLED;
    expect(lumperLifecycleEnabled()).toBe(false);
    process.env.LUMPER_LIFECYCLE_ENABLED = "false";
    expect(lumperLifecycleEnabled()).toBe(false);
    process.env.LUMPER_LIFECYCLE_ENABLED = "true";
    expect(lumperLifecycleEnabled()).toBe(true);
    if (prev === undefined) delete process.env.LUMPER_LIFECYCLE_ENABLED;
    else process.env.LUMPER_LIFECYCLE_ENABLED = prev;
  });
});
