import { describe, expect, it } from "vitest";
import { CAPITALIZE_REPAIR_THRESHOLD_CENTS, FIXED_ASSET_REPAIR_COA_ROLE, HEAVY_REPAIR_EXPENSE_COA_ROLE, repairBooksCoaRole } from "../../accounting/capitalize-threshold.js";
import { resolveWoApRepairCoaRole } from "../wo-ap-posting.service.js";
describe("wo-ap capitalize threshold wiring", () => {
  it("locks threshold at $7,000 (700_000 cents), never $7,500", () => {
    expect(CAPITALIZE_REPAIR_THRESHOLD_CENTS).toBe(700_000);
    expect(CAPITALIZE_REPAIR_THRESHOLD_CENTS).not.toBe(750_000);
  });
  it("$6,999 → heavy_repair_expense", () => {
    expect(repairBooksCoaRole(699_900)).toBe(HEAVY_REPAIR_EXPENSE_COA_ROLE);
    expect(resolveWoApRepairCoaRole(699_900)).toBe(HEAVY_REPAIR_EXPENSE_COA_ROLE);
  });
  it("$7,001 → fixed_asset_default", () => {
    expect(repairBooksCoaRole(700_100)).toBe(FIXED_ASSET_REPAIR_COA_ROLE);
    expect(resolveWoApRepairCoaRole(700_100)).toBe(FIXED_ASSET_REPAIR_COA_ROLE);
  });
  it("$7,000 exactly capitalizes", () => {
    expect(repairBooksCoaRole(700_000)).toBe(FIXED_ASSET_REPAIR_COA_ROLE);
  });
});
