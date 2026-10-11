import { describe, expect, it } from "vitest";
import { signedRateOverride } from "../settlement-creator-signed-rate.js";

const card48 = { basis_type: "per_mile_pay", rate_per_mile_cents: 48, rate_empty_per_mile_cents: null };

describe("ROUND 443.31 signed settlement rate", () => {
  it("5769: card 48¢, signed 45¢ -> override at 0.45 with the reason", () => {
    expect(signedRateOverride("5769", { line_haul_rate_cents: 45 }, card48)).toEqual({
      driver_pay_rate_per_mile: 0.45,
      driver_pay_rate_override_reason: "Signed settlement 5769: driver paid $0.45/mi",
    });
  });
  it("card already pays the signed rate -> no override", () => {
    expect(signedRateOverride("5771", { line_haul_rate_cents: 48, empty_miles: 10 }, card48)).toBeNull();
  });
  it("loaded matches but the card empty rate differs -> override", () => {
    expect(signedRateOverride("5772", { line_haul_rate_cents: 48, empty_miles: 10 }, { ...card48, rate_empty_per_mile_cents: 40 })).not.toBeNull();
  });
  it("no card at all -> override (the signed document is the only rate)", () => {
    expect(signedRateOverride("5773", { line_haul_rate_cents: 45 }, null)?.driver_pay_rate_per_mile).toBe(0.45);
  });
  it("no signed rate -> nothing invented", () => {
    expect(signedRateOverride("5774", { line_haul_rate_cents: null }, card48)).toBeNull();
  });
});
