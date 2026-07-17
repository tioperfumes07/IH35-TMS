import { describe, expect, it } from "vitest";
import { TEST_VENDOR_FIXTURE_RE, isTestVendorFixtureName } from "../fixture-vendor-name-pattern.js";

describe("TEST_VENDOR_FIXTURE_RE / isTestVendorFixtureName", () => {
  it.each([
    "TEST-VENDOR",
    "TEST-VENDOR-1",
    "test-vendor",
    "TEST_VENDOR",
    "TEST VENDOR",
    "Acme TEST-VENDOR LLC",
  ])("matches fixture name %j", (name) => {
    expect(TEST_VENDOR_FIXTURE_RE.test(name)).toBe(true);
    expect(isTestVendorFixtureName(name)).toBe(true);
  });

  it.each(["Acme Fuel", "TestVendorCo", "VENDOR-TEST", "Best Repair Shop"])(
    "does not match legitimate name %j",
    (name) => {
      expect(TEST_VENDOR_FIXTURE_RE.test(name)).toBe(false);
      expect(isTestVendorFixtureName(name)).toBe(false);
    }
  );

  it("source flags are case-insensitive", () => {
    expect(TEST_VENDOR_FIXTURE_RE.flags).toBe("i");
  });
});
