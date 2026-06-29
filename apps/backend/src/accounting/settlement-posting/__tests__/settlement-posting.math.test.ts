import { describe, expect, it } from "vitest";
import {
  applicableFloorCents,
  assertBalanced,
  breachesNetPayFloor,
  bucketRecoveryRoleKey,
  buildSettlementIdempotencyKey,
  dollarsToCents,
  netPayFloorCents,
  normalizeFloorPct,
  SettlementPostingError,
} from "../settlement-posting.math.js";

describe("FIN-18 settlement posting math", () => {
  it("dollarsToCents handles numeric/string/null", () => {
    expect(dollarsToCents("9000.00")).toBe(900000);
    expect(dollarsToCents(8500.5)).toBe(850050);
    expect(dollarsToCents(null)).toBe(0);
    expect(dollarsToCents("oops")).toBe(0);
  });

  it("normalizeFloorPct clamps invalid values to the 10% default", () => {
    expect(normalizeFloorPct(0.25)).toBe(0.25);
    expect(normalizeFloorPct("0.15")).toBe(0.15);
    expect(normalizeFloorPct(null)).toBe(0.1);
    expect(normalizeFloorPct(-1)).toBe(0.1);
    expect(normalizeFloorPct(2)).toBe(0.1);
  });

  it("netPayFloorCents = ceil(gross * pct) — 10% of $9,000 gross is $900", () => {
    expect(netPayFloorCents(900000, 0.1)).toBe(90000);
    // ceil rounds the floor UP in the driver's favor
    expect(netPayFloorCents(99999, 0.1)).toBe(10000);
  });

  it("breachesNetPayFloor blocks when deductions push net below the floor", () => {
    // $9,000 gross, $8,500 deductions -> net $500 < $900 floor -> breach
    expect(breachesNetPayFloor(900000, 850000, 0.1)).toBe(true);
    // $9,000 gross, $500 deductions -> net $8,500 >= $900 floor -> OK
    expect(breachesNetPayFloor(900000, 50000, 0.1)).toBe(false);
  });

  it("applicableFloorCents: 1099 uses policy floor; W-2 uses the STRICTER of policy/FLSA", () => {
    expect(applicableFloorCents({ grossCents: 900000, floorPct: 0.1, workerClass: "1099" })).toBe(90000);
    // W-2 with an FLSA floor higher than the policy floor -> FLSA wins (stricter)
    expect(applicableFloorCents({ grossCents: 900000, floorPct: 0.1, workerClass: "w2", flsaFloorCents: 120000 })).toBe(120000);
    // W-2 without FLSA inputs degrades to the policy floor (default behavior)
    expect(applicableFloorCents({ grossCents: 900000, floorPct: 0.1, workerClass: "w2", flsaFloorCents: null })).toBe(90000);
  });

  it("bucketRecoveryRoleKey derives the role_key per bucket", () => {
    expect(bucketRecoveryRoleKey("damage")).toBe("damage_recovery");
    expect(bucketRecoveryRoleKey("Advance")).toBe("advance_recovery");
  });

  it("buildSettlementIdempotencyKey is deterministic + purpose-scoped", () => {
    const a = buildSettlementIdempotencyKey("OPCO", "SETT", "initial_post");
    expect(a).toBe("ih35:settlement-gl:v1:opco:sett:initial_post");
    expect(buildSettlementIdempotencyKey("OPCO", "SETT", "reversal")).not.toBe(a);
  });

  it("assertBalanced throws UNBALANCED_ENTRY when debits != credits", () => {
    expect(() =>
      assertBalanced([
        { debit_or_credit: "debit", amount_cents: 900000 },
        { debit_or_credit: "credit", amount_cents: 50000 },
        { debit_or_credit: "credit", amount_cents: 850000 },
      ])
    ).not.toThrow();
    try {
      assertBalanced([
        { debit_or_credit: "debit", amount_cents: 900000 },
        { debit_or_credit: "credit", amount_cents: 50000 },
      ]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SettlementPostingError);
      expect((e as SettlementPostingError).code).toBe("UNBALANCED_ENTRY");
    }
  });
});
