import { describe, expect, it } from "vitest";
import { filterFacets, gridFacets, sortRows, splitPicks, targetPctOf, type GridRow } from "./desk.service.js";

const rows: GridRow[] = [
  { id: "1", brand: "CALVIN KLEIN", name: "ONE", size_ml: 200, gender: "U", category: "Unisex", display_name: "CALVIN KLEIN ONE 200" },
  { id: "2", brand: "CALVIN KLEIN", name: "ETERNITY", size_ml: 100, gender: "W", category: "Tester Women", display_name: "CALVIN KLEIN ETERNITY 100" },
  { id: "3", brand: "ARMAF", name: "CLUB DE NUIT", size_ml: 105, gender: "M", category: "Men", display_name: "ARMAF CLUB DE NUIT 105" },
  { id: "4", brand: "ARMAF", name: "CLUB DE NUIT", size_ml: 30, gender: "M", category: "Set Men", display_name: "ARMAF CLUB DE NUIT 30" },
  { id: "5", brand: "", name: "BLOTTER STRIPS", size_ml: null, gender: "", category: "Various", display_name: "BLOTTER STRIPS" },
];

describe("perfume grid facets", () => {
  it("splits comma picks and drops blanks and repeats", () => {
    expect(splitPicks(" Men, ,Men,Set Men ")).toEqual(["Men", "Set Men"]);
  });
  it("filters by type, gender and brand together; empty picks keep everything", () => {
    expect(filterFacets(rows, { category: [], gender: [], brand: [] })).toHaveLength(5);
    expect(filterFacets(rows, { category: ["Men", "Set Men"], gender: [], brand: [] }).map((r) => r.id)).toEqual(["3", "4"]);
    expect(filterFacets(rows, { category: [], gender: ["W", "U"], brand: ["CALVIN KLEIN"] }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterFacets(rows, { category: [], gender: [], brand: ["—"] }).map((r) => r.id)).toEqual(["5"]);
  });
  it("counts each facet against the other picks, blank last, and keeps a pick that has no rows", () => {
    const f = gridFacets(rows, { category: [], gender: ["M"], brand: [] });
    expect(f.brand).toEqual([{ value: "ARMAF", count: 2 }]);
    expect(f.gender).toEqual([{ value: "M", count: 2 }, { value: "U", count: 1 }, { value: "W", count: 1 }, { value: "—", count: 1 }]);
    const g = gridFacets(rows, { category: [], gender: [], brand: ["NOBODY"] });
    expect(g.brand.find((x) => x.value === "NOBODY")).toEqual({ value: "NOBODY", count: 0 });
  });
  it("breaks every sort tie by brand, then name, then size", () => {
    expect(sortRows(rows, "gender", "asc").map((r) => r.id)).toEqual(["4", "3", "1", "2", "5"]);
  });
});

describe("perfume grid typed margin", () => {
  const rules = { wholesale_targets_pct: [11, 12.5, 15] } as unknown as Parameters<typeof targetPctOf>[0];
  it("uses the margin typed on the grid, else the first saved target, and stays in 0–95", () => {
    expect(targetPctOf(rules, 18)).toBe(18);
    expect(targetPctOf(rules, null)).toBe(11);
    expect(targetPctOf(rules, undefined)).toBe(11);
    expect(targetPctOf({ wholesale_targets_pct: [] } as unknown as typeof rules, null)).toBe(12);
    expect(targetPctOf(rules, 120)).toBe(95);
  });
});
