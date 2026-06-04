import { describe, expect, it } from "vitest";
import { PARTS_INVENTORY_LOW_STOCK_THRESHOLD, partNeedsReorder } from "../pages/maintenance/parts-low-stock";

describe("maintenance parts unification (B23)", () => {
  it("uses canonical low-stock threshold of 2 when reorder threshold is unset", () => {
    expect(PARTS_INVENTORY_LOW_STOCK_THRESHOLD).toBe(2);
    expect(partNeedsReorder(2, 0)).toBe(true);
    expect(partNeedsReorder(3, 0)).toBe(false);
  });

  it("honors explicit reorder threshold over default low-stock cutoff", () => {
    expect(partNeedsReorder(5, 5)).toBe(true);
    expect(partNeedsReorder(6, 5)).toBe(false);
  });

  it("treats zero on-hand as reorder regardless of threshold", () => {
    expect(partNeedsReorder(0, 0)).toBe(true);
    expect(partNeedsReorder(0, 10)).toBe(true);
  });
});
