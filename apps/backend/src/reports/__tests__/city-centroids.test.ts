/**
 * DEADHEAD-REPORT-ESTIMATED-BRANCH-ALWAYS-RETURNS-ZERO-DEADHEAD
 *
 * estimateCityPairMiles() must produce a real, nonzero, sane distance for two different known
 * cities, must return exactly 0 (not null) for the same city, and must return null (genuinely
 * unknown — never a fabricated 0) when either city is outside the curated table.
 */
import { describe, expect, it } from "vitest";
import { estimateCityPairMiles, haversineMiles } from "../city-centroids.js";

describe("estimateCityPairMiles", () => {
  it("returns a real, sane, nonzero distance between two different known cities", () => {
    const miles = estimateCityPairMiles("Austin, TX", "San Antonio, TX");
    expect(miles).not.toBeNull();
    // Real road distance is ~80 miles; a great-circle estimate should be in a sane neighborhood,
    // never the old hardcoded 0.
    expect(miles).toBeGreaterThan(50);
    expect(miles).toBeLessThan(100);
  });

  it("is symmetric — city A to B equals city B to A", () => {
    const ab = estimateCityPairMiles("Laredo, TX", "Houston, TX");
    const ba = estimateCityPairMiles("Houston, TX", "Laredo, TX");
    expect(ab).toBe(ba);
  });

  it("is case-insensitive and tolerates a state suffix or its absence", () => {
    const withState = estimateCityPairMiles("Laredo, TX", "Houston, TX");
    const upper = estimateCityPairMiles("LAREDO, TEXAS", "HOUSTON, TX");
    const bare = estimateCityPairMiles("Laredo", "Houston");
    expect(upper).toBe(withState);
    expect(bare).toBe(withState);
  });

  it("returns 0 for the identical city, not null", () => {
    expect(estimateCityPairMiles("Houston, TX", "Houston, TX")).toBe(0);
  });

  it("returns null (genuinely unknown) when a city is outside the curated table", () => {
    expect(estimateCityPairMiles("Nowhereville, ZZ", "Houston, TX")).toBeNull();
    expect(estimateCityPairMiles("Houston, TX", "Nowhereville, ZZ")).toBeNull();
    expect(estimateCityPairMiles("Nowhereville, ZZ", "Alsonowhere, ZZ")).toBeNull();
  });

  it("covers a real cross-border lane relevant to this carrier (Laredo <-> Monterrey)", () => {
    const miles = estimateCityPairMiles("Laredo, TX", "Monterrey, NL");
    expect(miles).not.toBeNull();
    expect(miles).toBeGreaterThan(0);
  });
});

describe("haversineMiles", () => {
  it("returns 0 for identical coordinates", () => {
    const p = { lat: 29.7604, lon: -95.3698 };
    expect(haversineMiles(p, p)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { lat: 27.5064, lon: -99.5075 };
    const b = { lat: 29.7604, lon: -95.3698 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});
