import { describe, expect, it } from "vitest";
import { filterFacets, gridFacets, sortRows, splitPicks, targetPctOf, wholesaleAction, type GridRow } from "./desk.service.js";

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

describe("perfume grid vendor + size filters", () => {
  const vr: GridRow[] = [
    { id: "a", brand: "X", name: "A", size_ml: 100, carried_by: "Miami Trading Zone (MTZ)\nJIZAN (Dubai export)" },
    { id: "b", brand: "X", name: "B", size_ml: 50, carried_by: "Perfume Center of America (Kanak)" },
    { id: "c", brand: "X", name: "C", size_ml: null, carried_by: "" },
  ];
  it("keeps items carried by ANY picked vendor; counts each vendor once per item", () => {
    expect(filterFacets(vr, { category: [], gender: [], brand: [], vendor: ["JIZAN (Dubai export)"] }).map((r) => r.id)).toEqual(["a"]);
    expect(filterFacets(vr, { category: [], gender: [], brand: [], vendor: ["JIZAN (Dubai export)", "Perfume Center of America (Kanak)"] }).map((r) => r.id)).toEqual(["a", "b"]);
    const f = gridFacets(vr, { category: [], gender: [], brand: [] });
    expect(f.vendor).toEqual([
      { value: "JIZAN (Dubai export)", count: 1 }, { value: "Miami Trading Zone (MTZ)", count: 1 },
      { value: "Perfume Center of America (Kanak)", count: 1 }, { value: "—", count: 1 }]);
  });
  it("filters by size, blank size is '—'", () => {
    expect(filterFacets(vr, { category: [], gender: [], brand: [], size: ["50"] }).map((r) => r.id)).toEqual(["b"]);
    expect(gridFacets(vr, { category: [], gender: [], brand: [] }).size).toEqual([{ value: "50", count: 1 }, { value: "100", count: 1 }, { value: "—", count: 1 }]);
  });
});

describe("perfume wholesale raise / lower", () => {
  it("says how far under or over the lowest competitor my price is", () => {
    expect(wholesaleAction(150)).toBe("Under by $1.50 — can raise");
    expect(wholesaleAction(-75)).toBe("Over by $0.75 — lower to compete");
    expect(wholesaleAction(0)).toBe("Same as lowest competitor");
  });
});

describe("perfume import — a UPC printed on two different products", () => {
  it("is found and not trusted; the same product printed twice is fine", async () => {
    const { ambiguousUpcs } = await import("./desk.service.js");
    const rows = [
      { upc: "6291106816235", description: "AL HARAMAIN AMBER(M)12ML CONCENTRATED PERFUME OIL", brand: "Al Haramain" },
      { upc: "6291106816235", description: "AL HARAMAIN BAHR(M)12ML CONCENTRATED PERFUME OIL", brand: "Al Haramain" },
      { upc: "8411061067918", description: "CAROLINA HERRERA CH(W)(T)EDT SP 3.4oz(CAP,BOX)", brand: "Carolina Herrera" },
      { upc: "8411061067918", description: "CAROLINA HERRERA CH(W)(T)EDT SP 3.4oz(CAP,BOX)(ONLY USA)(LI FREE)", brand: "Carolina Herrera" },
    ];
    expect([...ambiguousUpcs(rows, {})]).toEqual(["6291106816235"]);
  });
});
