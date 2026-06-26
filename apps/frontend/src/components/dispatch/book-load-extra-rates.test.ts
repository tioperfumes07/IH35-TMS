import { describe, expect, it } from "vitest";
import { sumStopExtraRatesCents, stopExtraRateChargeLines, type StopExtraRatesInput } from "./book-load-extra-rates";

const stops: StopExtraRatesInput[] = [
  { extra_rates: [{ rate_type: "extra_stop_fee", amount_cents: 7700, description: "extra stop" }] },
  { extra_rates: [] },
  { extra_rates: [{ rate_type: "detention", amount_cents: 5000 }, { rate_type: "other", amount_cents: 0 }] },
];

describe("book-load-extra-rates — W7 per-stop extra-rate sum", () => {
  it("sums every stop's extra-rate amounts (the $77 GUARD set must count)", () => {
    expect(sumStopExtraRatesCents(stops)).toBe(12700); // 7700 + 5000
  });

  it("converts extra rates into customer charge lines (code from rate_type), skipping zero", () => {
    expect(stopExtraRateChargeLines(stops)).toEqual([
      { code: "extra_stop_fee", amount_cents: 7700 },
      { code: "detention", amount_cents: 5000 },
    ]);
  });

  it("is safe on empty/undefined stops and negative/garbage amounts", () => {
    expect(sumStopExtraRatesCents(undefined)).toBe(0);
    expect(sumStopExtraRatesCents([])).toBe(0);
    expect(sumStopExtraRatesCents([{ extra_rates: [{ amount_cents: -100 }] }])).toBe(0);
    expect(stopExtraRateChargeLines([{ extra_rates: [{ rate_type: "", amount_cents: 200 }] }])).toEqual([
      { code: "extra_rate", amount_cents: 200 },
    ]);
  });
});
