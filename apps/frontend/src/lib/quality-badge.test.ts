import { describe, it, expect } from "vitest";
import { customerQualityKind, vendorQualityKind } from "./quality-badge";
import { VENDOR_PROFILE_META_PREFIX } from "./vendorProfileMeta";

// CUST-2 / VEND-5 — missing data must NOT default to a worst/arbitrary rating. The key regression:
// Number(null ?? "") === Number("") === 0 (finite) made a scoreless customer render red "Late-pay".
describe("customerQualityKind — rates only from real data", () => {
  it("returns 'none' (No history) when there is no score and no meaningful flag", () => {
    expect(customerQualityKind(null, "standard")).toBe("none");
    expect(customerQualityKind(undefined, undefined)).toBe("none");
    expect(customerQualityKind("", null)).toBe("none"); // the empty-string-becomes-0 trap
  });

  it("maps real numeric scores at the boundaries", () => {
    expect(customerQualityKind("0", "standard")).toBe("late"); // a REAL 0 is late-pay, not 'none'
    expect(customerQualityKind("69", "standard")).toBe("late");
    expect(customerQualityKind("70", "standard")).toBe("watch");
    expect(customerQualityKind("89", "standard")).toBe("watch");
    expect(customerQualityKind("90", "standard")).toBe("good");
    expect(customerQualityKind(95, "standard")).toBe("good");
  });

  it("falls back to an explicit flag only (never 'standard')", () => {
    expect(customerQualityKind(null, "preferred")).toBe("good");
    expect(customerQualityKind(null, "caution")).toBe("watch");
    expect(customerQualityKind(null, "avoid")).toBe("late");
  });
});

describe("vendorQualityKind — rates only from a real profile block", () => {
  it("returns 'none' when notes have no vendor-profile meta block (the amber-on-everyone bug)", () => {
    expect(vendorQualityKind(null)).toBe("none");
    expect(vendorQualityKind("")).toBe("none");
    expect(vendorQualityKind("just some free-text notes")).toBe("none");
  });

  it("reads an explicit rating from a real profile block", () => {
    const withRating = (r: string) => `${VENDOR_PROFILE_META_PREFIX}${JSON.stringify({ qualityRating: r })}\n`;
    expect(vendorQualityKind(withRating("good"))).toBe("good");
    expect(vendorQualityKind(withRating("bad"))).toBe("bad");
    expect(vendorQualityKind(withRating("medium"))).toBe("medium");
  });
});
