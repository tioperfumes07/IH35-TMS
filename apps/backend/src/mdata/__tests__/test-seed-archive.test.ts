import { describe, expect, it } from "vitest";
import { isTestSeedDisplayName, isTestSeedEmail } from "../test-seed-archive.js";

describe("test-seed-archive pattern helpers", () => {
  it("detects TEST-* and seed-* display names", () => {
    expect(isTestSeedDisplayName("TEST-CUSTOMER-1")).toBe(true);
    expect(isTestSeedDisplayName("seed-broker")).toBe(true);
    expect(isTestSeedDisplayName("Acme Freight LLC")).toBe(false);
  });

  it("detects seed invalid emails", () => {
    expect(isTestSeedEmail("seed-test-driver-1@seed.invalid")).toBe(true);
    expect(isTestSeedEmail("seed-test-admin@example.com")).toBe(true);
    expect(isTestSeedEmail("dispatcher@ih35.local")).toBe(false);
  });
});
