import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_DASHBOARD_TAB_COUNT,
  MAINTENANCE_HOME_QUICK_JUMP_COUNT,
  MAINTENANCE_LISTS_CATALOG_COUNT,
  MAINTENANCE_MASTER_DATA_NAV_COUNT,
  MAINTENANCE_MODULE_NAV_COUNT,
} from "../components/maintenance/MAINTENANCE_NAV_CONFIG";

describe("maintenance nav count reconcile (B24)", () => {
  it("defines canonical module nav count matching sidebar flyout", () => {
    expect(MAINTENANCE_MODULE_NAV_COUNT).toBe(10);
    expect(MAINTENANCE_HOME_QUICK_JUMP_COUNT).toBe(MAINTENANCE_MODULE_NAV_COUNT);
  });

  it("includes Drivers in master data hover count", () => {
    expect(MAINTENANCE_MASTER_DATA_NAV_COUNT).toBe(8);
  });

  it("keeps dashboard operational tab count at 10", () => {
    expect(MAINTENANCE_DASHBOARD_TAB_COUNT).toBe(10);
  });

  it("tracks nine live lists maintenance catalogs", () => {
    expect(MAINTENANCE_LISTS_CATALOG_COUNT).toBe(9);
  });
});
