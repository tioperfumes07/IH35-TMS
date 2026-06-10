import { describe, expect, it } from "vitest";
import {
  isTestSeedDisplayName,
  isTestSeedEmail,
  EXCLUDE_ARCHIVED_DRIVERS_SQL,
  EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL,
  EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL,
  EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL,
} from "../test-seed-archive.js";

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

  it("EXCLUDE_ARCHIVED_* SQL constants are non-empty and reference archived_at", () => {
    for (const sql of [
      EXCLUDE_ARCHIVED_DRIVERS_SQL,
      EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL,
      EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL,
      EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL,
    ]) {
      expect(typeof sql).toBe("string");
      expect(sql.length).toBeGreaterThan(0);
      expect(sql).toContain("archived_at");
    }
  });
});
