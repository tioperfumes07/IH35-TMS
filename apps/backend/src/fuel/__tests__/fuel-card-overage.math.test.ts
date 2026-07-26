import { describe, expect, it } from "vitest";
import {
  buildOverageReason,
  computeFuelCardOverageCents,
  type FuelCardOveragePolicy,
} from "../fuel-card-overage.math.js";

const limitOnly: FuelCardOveragePolicy = {
  per_transaction_limit_cents: 40000, // $400
  recover_non_fuel_purchases: false,
};
const nonFuelOnly: FuelCardOveragePolicy = {
  per_transaction_limit_cents: null,
  recover_non_fuel_purchases: true,
};
const both: FuelCardOveragePolicy = {
  per_transaction_limit_cents: 40000,
  recover_non_fuel_purchases: true,
};

describe("BANK-DOM-06 computeFuelCardOverageCents", () => {
  it("is a strict no-op when the owner has designated NO policy", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 999_00, fuel_type: "diesel", policy: null })
    ).toEqual({ overage_cents: 0, rule: "none" });
  });

  it("recovers only the EXCESS above the per-transaction limit", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 50000, fuel_type: "diesel", policy: limitOnly })
    ).toEqual({ overage_cents: 10000, rule: "over_transaction_limit" });
  });

  it("recovers nothing at or below the limit (boundary is inclusive of the limit)", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 40000, fuel_type: "diesel", policy: limitOnly })
    ).toEqual({ overage_cents: 0, rule: "none" });
    expect(
      computeFuelCardOverageCents({ total_cents: 39999, fuel_type: "diesel", policy: limitOnly })
    ).toEqual({ overage_cents: 0, rule: "none" });
  });

  it("recovers a non-fuel card purchase IN FULL only when the policy opts in", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 8_00, fuel_type: "other", policy: nonFuelOnly })
    ).toEqual({ overage_cents: 800, rule: "non_fuel_purchase" });
    // Same purchase, policy opted OUT -> nothing recovered.
    expect(
      computeFuelCardOverageCents({ total_cents: 8_00, fuel_type: "other", policy: limitOnly })
    ).toEqual({ overage_cents: 0, rule: "none" });
  });

  it("never double-charges: a non-fuel purchase is recovered in full, NOT full + over-limit excess", () => {
    // $500 non-fuel with a $400 limit. Full recovery is $500 — never $500 + $100.
    const result = computeFuelCardOverageCents({
      total_cents: 50000,
      fuel_type: "other",
      policy: both,
    });
    expect(result).toEqual({ overage_cents: 50000, rule: "non_fuel_purchase" });
    expect(result.overage_cents).toBeLessThanOrEqual(50000);
  });

  it("treats real fuel types under the limit as clean company cost", () => {
    for (const fuelType of ["diesel", "def", "gas", "reefer_diesel"]) {
      expect(
        computeFuelCardOverageCents({ total_cents: 30000, fuel_type: fuelType, policy: both })
      ).toEqual({ overage_cents: 0, rule: "none" });
    }
  });

  it("refuses to charge a driver on non-positive, NaN, or zero-limit input", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 0, fuel_type: "other", policy: both }).overage_cents
    ).toBe(0);
    expect(
      computeFuelCardOverageCents({ total_cents: -5000, fuel_type: "diesel", policy: limitOnly })
        .overage_cents
    ).toBe(0);
    expect(
      computeFuelCardOverageCents({
        total_cents: Number.NaN,
        fuel_type: "diesel",
        policy: limitOnly,
      }).overage_cents
    ).toBe(0);
    expect(
      computeFuelCardOverageCents({
        total_cents: 50000,
        fuel_type: "diesel",
        policy: { per_transaction_limit_cents: 0, recover_non_fuel_purchases: false },
      }).overage_cents
    ).toBe(0);
  });

  it("never returns more than the driver was actually charged", () => {
    for (const total of [1, 100, 39999, 40000, 40001, 999999]) {
      for (const policy of [limitOnly, nonFuelOnly, both]) {
        for (const fuelType of ["diesel", "other"]) {
          const { overage_cents } = computeFuelCardOverageCents({
            total_cents: total,
            fuel_type: fuelType,
            policy,
          });
          expect(overage_cents).toBeGreaterThanOrEqual(0);
          expect(overage_cents).toBeLessThanOrEqual(total);
        }
      }
    }
  });
});

describe("BANK-DOM-06 buildOverageReason", () => {
  it("names the rule and the real dollar amounts for the audit trail", () => {
    const overLimit = computeFuelCardOverageCents({
      total_cents: 50000,
      fuel_type: "diesel",
      policy: limitOnly,
    });
    const reason = buildOverageReason(overLimit, limitOnly, 50000);
    expect(reason).toContain("$500.00");
    expect(reason).toContain("$400.00");
    expect(reason).toContain("$100.00");

    const nonFuel = computeFuelCardOverageCents({
      total_cents: 800,
      fuel_type: "other",
      policy: nonFuelOnly,
    });
    expect(buildOverageReason(nonFuel, nonFuelOnly, 800)).toContain("non-fuel");
  });
});
