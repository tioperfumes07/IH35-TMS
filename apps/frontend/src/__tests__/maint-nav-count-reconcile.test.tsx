import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG } from "../pages/lists/components/AllCatalogsMap";
import {
  MAINTENANCE_DASHBOARD_TAB_COUNT,
  MAINTENANCE_HOME_QUICK_JUMP_COUNT,
  MAINTENANCE_LISTS_CATALOG_COUNT,
  MAINTENANCE_MASTER_DATA_NAV_COUNT,
  MAINTENANCE_MODULE_NAV_COUNT,
} from "../components/maintenance/MAINTENANCE_NAV_CONFIG";

describe("maintenance nav count reconcile (B24)", () => {
  it("defines canonical module nav count matching sidebar flyout", () => {
    expect(MAINTENANCE_MODULE_NAV_COUNT).toBe(13);
    expect(MAINTENANCE_HOME_QUICK_JUMP_COUNT).toBe(MAINTENANCE_MODULE_NAV_COUNT);
  });

  it("includes Drivers + Fault Drafts/Rules in master data hover count", () => {
    expect(MAINTENANCE_MASTER_DATA_NAV_COUNT).toBe(11);
  });

  it("keeps dashboard operational tab count at 10", () => {
    expect(MAINTENANCE_DASHBOARD_TAB_COUNT).toBe(10);
  });

  it("MAINTENANCE_LISTS_CATALOG_COUNT matches the real catalog map, not a hand-typed number", () => {
    // This asserted a literal (20) against another literal (the constant, then 21) — two magic numbers that
    // drift the moment a catalog is added, which is exactly what happened. Assert against the SOURCE OF
    // TRUTH instead: the maintenance domain in AllCatalogsMap's DOMAIN_CONFIG. Now adding a catalog either
    // updates the constant or fails here, and no edit to this file is needed to track reality.
    const maintenance = DOMAIN_CONFIG.find((domain) => domain.key === "maintenance");
    expect(maintenance, "maintenance domain missing from DOMAIN_CONFIG").toBeTruthy();
    expect(MAINTENANCE_LISTS_CATALOG_COUNT).toBe(maintenance!.catalogs.length);
  });
});
