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

describe("ROUND 355 R-2 — the cap is GALLONS, per unit, from the unit's own tank", () => {
  const policy: FuelCardOveragePolicy = {
    per_transaction_limit_cents: 90000, // $900 — last fallback only
    recover_non_fuel_purchases: true,
    per_swipe_gallon_limit: 150,
  };

  it("same gallons, different tanks: a large tank owes nothing, a small tank owes the excess", () => {
    // 220 gal at $4.50 = $990.00 on the card.
    const base = { total_cents: 99000, fuel_type: "diesel", policy, gallons: 220, price_per_gallon: 4.5 };
    expect(computeFuelCardOverageCents({ ...base, tank_capacity_gallons: 300, tank_source: "unit_tank" })).toEqual({
      overage_cents: 0,
      rule: "none",
    });
    const small = computeFuelCardOverageCents({ ...base, tank_capacity_gallons: 120, tank_source: "unit_tank" });
    // (220 − 120) × $4.50 = $450.00
    expect(small).toMatchObject({
      overage_cents: 45000,
      rule: "over_gallon_limit",
      gallons: 220,
      gallon_limit: 120,
      gallon_limit_source: "unit_tank",
      unit_price_cents: 450,
    });
  });

  it("gallons first: under the tank but over the $900 dollar limit recovers NOTHING", () => {
    // 200 gal at $5.00 = $1,000 > $900, but a 250-gal tank holds it all.
    expect(
      computeFuelCardOverageCents({
        total_cents: 100000, fuel_type: "diesel", policy, gallons: 200, price_per_gallon: 5, tank_capacity_gallons: 250,
      })
    ).toEqual({ overage_cents: 0, rule: "none" });
  });

  it("no recorded tank: the policy's 150-gallon fallback applies", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 80000, fuel_type: "diesel", policy, gallons: 160, price_per_gallon: 5 })
    ).toMatchObject({ overage_cents: 5000, rule: "over_gallon_limit", gallon_limit: 150, gallon_limit_source: "policy_per_swipe" });
  });

  it("no pump price on the row: the unit price is total ÷ gallons", () => {
    // $800 / 200 gal = $4.00; (200 − 150) × $4.00 = $200
    expect(
      computeFuelCardOverageCents({ total_cents: 80000, fuel_type: "diesel", policy, gallons: 200, price_per_gallon: null })
    ).toMatchObject({ overage_cents: 20000, unit_price_cents: 400 });
  });

  it("reefer fuel is judged against the reefer tank", () => {
    expect(
      computeFuelCardOverageCents({
        total_cents: 30000, fuel_type: "reefer_diesel", policy, gallons: 60, price_per_gallon: 5,
        tank_capacity_gallons: 50, tank_source: "reefer_tank",
      })
    ).toMatchObject({ overage_cents: 5000, gallon_limit_source: "reefer_tank" });
  });

  it("the dollar limit is the LAST fallback — only for a row with no gallons", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 100000, fuel_type: "diesel", policy, gallons: null })
    ).toEqual({ overage_cents: 10000, rule: "over_transaction_limit" });
  });

  it("non-fuel stays recovered in full, never also on gallons", () => {
    expect(
      computeFuelCardOverageCents({ total_cents: 2500, fuel_type: "other", policy, gallons: 999, tank_capacity_gallons: 100 })
    ).toEqual({ overage_cents: 2500, rule: "non_fuel_purchase" });
  });

  it("never recovers more than the purchase", () => {
    const r = computeFuelCardOverageCents({
      total_cents: 1000, fuel_type: "diesel", policy, gallons: 500, price_per_gallon: 9, tank_capacity_gallons: 1,
    });
    expect(r.overage_cents).toBe(1000);
  });

  it("the reason names the gallons, the limit, its source and the price", () => {
    const r = computeFuelCardOverageCents({
      total_cents: 99000, fuel_type: "diesel", policy, gallons: 220, price_per_gallon: 4.5, tank_capacity_gallons: 120,
    });
    expect(buildOverageReason(r, policy, 99000)).toBe(
      "Fuel-card overage: 220 gal exceeded the unit's tank capacity of 120 gal by 100 gal at $4.500/gal = $450.00 (recovered from driver settlement)"
    );
  });
});
