import { describe, expect, it } from "vitest";
import { avgAgeYears, companyCurrentYear } from "./fleet-age.js";

describe("avgAgeYears (FLEET-1)", () => {
  it("averages only year-bearing units and excludes null years (not 0)", () => {
    // {2009, 2022, null} with current year 2026 -> ages {17, 4} -> avg 10.5 over 2 units.
    const result = avgAgeYears([2009, 2022, null], 2026);
    expect(result).toBe(10.5);
    expect(result).not.toBe(0);
  });

  it("returns null when no unit has a usable model year", () => {
    expect(avgAgeYears([null, null, null], 2026)).toBeNull();
    expect(avgAgeYears([], 2026)).toBeNull();
    expect(avgAgeYears([null, 0, undefined], 2026)).toBeNull();
  });

  it("treats 0 and undefined model years as missing (excluded from both num and denom)", () => {
    // Only 2020 is usable: age = 6.
    expect(avgAgeYears([0, undefined, 2020, null], 2026)).toBe(6);
  });

  it("coerces numeric string years", () => {
    expect(avgAgeYears(["2016", "2024"], 2026)).toBe(6); // ages {10, 2} -> avg 6
  });

  it("ignores negative ages from future-dated garbage years", () => {
    // 2099 -> negative age, skipped; only 2020 counts -> age 6.
    expect(avgAgeYears([2099, 2020], 2026)).toBe(6);
  });

  it("companyCurrentYear returns a sane 4-digit year", () => {
    const y = companyCurrentYear(new Date("2026-06-29T12:00:00Z"));
    expect(y).toBe(2026);
  });
});
