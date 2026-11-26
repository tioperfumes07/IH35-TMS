import { describe, expect, it } from "vitest";
import { cellsForServer, isHeldOldXls } from "../usePerfumeHeldXls";

describe("held old .xls read in the browser", () => {
  it("picks only held .xls files the engine held for their format, with a vendor", () => {
    const base = { status: "held" as const, file_name: "PCA LIST.xls", reason: "Old Excel format (.xls) — the desk reads it in the browser the next time the Mail tab is open.", vendor_id: "v1" };
    expect(isHeldOldXls(base)).toBe(true);
    expect(isHeldOldXls({ ...base, vendor_id: null })).toBe(false);
    expect(isHeldOldXls({ ...base, status: "imported" })).toBe(false);
    expect(isHeldOldXls({ ...base, file_name: "list.xlsx" })).toBe(false);
    expect(isHeldOldXls({ ...base, reason: "Less than half the lines of this vendor's list in use" })).toBe(false);
  });

  it("sends only text, finite numbers and empties, at most 200 columns", () => {
    const wide = Array.from({ length: 250 }, (_, i) => i);
    const out = cellsForServer([["Asad", 14.25, true, null, "", Number.NaN, new Date("2026-11-26T00:00:00Z"), "x".repeat(3000)], wide]);
    expect(out[0]).toEqual(["Asad", 14.25, "TRUE", null, null, null, "2026-11-26", "x".repeat(2000)]);
    expect(out[1]).toHaveLength(200);
  });
});
