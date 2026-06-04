import { describe, expect, it } from "vitest";
import { bookLoadRateTotalCents, mergeBookLoadCharges, sumChargeLinesCents } from "../book-load-accessorial.js";

describe("book-load-accessorial (B21-D3)", () => {
  it("sums charge line cents", () => {
    expect(
      sumChargeLinesCents([
        { code: "linehaul", amount_cents: 10000 },
        { code: "detention", amount_cents: 2500 },
      ])
    ).toBe(12500);
  });

  it("merges linehaul, fuel, and accessorial lines for rate total", () => {
    const charges = mergeBookLoadCharges({
      linehaul_cents: 50000,
      fuel_surcharge_cents: 5000,
      accessorial_lines: [
        { code: "DETENTION", amount_cents: 3000 },
        { code: "LUMPER", amount_cents: 0 },
      ],
    });
    expect(charges).toHaveLength(3);
    expect(bookLoadRateTotalCents(charges)).toBe(58000);
  });
});
