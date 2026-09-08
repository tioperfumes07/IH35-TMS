import { describe, expect, it } from "vitest";
import { resolveMirrorLocalDriverId } from "./driver-mirror-collector.js";

const map = (entries: Array<[string, string[]]>) => new Map(entries);

describe("resolveMirrorLocalDriverId", () => {
  it("prefers the unique authoritative Samsara id over ambiguous license and name matches", () => {
    expect(resolveMirrorLocalDriverId({
      samsaraDriverId: "sam-1",
      licenseNumber: "MX123",
      normalizedName: "same driver",
      bySamsaraId: map([["sam-1", ["driver-authoritative"]]]),
      byLicense: map([["MX123", ["duplicate-a", "duplicate-b"]]]),
      byName: map([["same driver", ["duplicate-a", "duplicate-b"]]]),
    })).toBe("driver-authoritative");
  });

  it("does not guess when the authoritative id itself is duplicated", () => {
    expect(resolveMirrorLocalDriverId({
      samsaraDriverId: "sam-1",
      licenseNumber: null,
      normalizedName: null,
      bySamsaraId: map([["sam-1", ["duplicate-a", "duplicate-b"]]]),
      byLicense: new Map(),
      byName: new Map(),
    })).toBeNull();
  });

  it("retains the unique-license then unique-exact-name fallbacks", () => {
    const shared = { samsaraDriverId: "unknown", bySamsaraId: new Map<string, string[]>() };
    expect(resolveMirrorLocalDriverId({
      ...shared,
      licenseNumber: "MX123",
      normalizedName: "name",
      byLicense: map([["MX123", ["license-driver"]]]),
      byName: map([["name", ["name-driver"]]]),
    })).toBe("license-driver");
    expect(resolveMirrorLocalDriverId({
      ...shared,
      licenseNumber: null,
      normalizedName: "name",
      byLicense: new Map(),
      byName: map([["name", ["name-driver"]]]),
    })).toBe("name-driver");
  });
});
