/**
 * PERFUME-DESK offer compare (owner 2026-11-13: "upload … my wholesale prices and my prices to vendors … to compare in
 * wholesale and with other vendors"). Pure: no database.
 *  - Narrowed to my offer list, every offer item stays in the Wholesale tab even with no competitor price.
 *  - Search finds an item by the owner's own wording on any current vendor line ("CLUB DE NUIT" → item named "CDN …").
 */
import { describe, expect, it } from "vitest";
import { filterView, searchRows, wholesaleAction, type GridRow } from "./desk.service.js";
import { readFileSync } from "node:fs";

const row = (o: Partial<GridRow>): GridRow => ({ id: "x", brand: "ARMAF", name: "CDN INTENSE MAN", display_name: "ARMAF CDN INTENSE MAN 105ML", upcs: "6085010044712", line_text: "", ...o });

describe("wholesale offer compare", () => {
  const rows: GridRow[] = [
    row({ id: "a", my_offer_price: 2250, landed_likely: 2000, low_sell: 2500, line_text: "CLUB DE NUIT INTENSE MAN EDT 105ML (M) | 105903" }),
    row({ id: "b", upcs: "6294015165012", my_offer_price: 3800, landed_likely: null, low_sell: null, name: "CDN PRIVATE KEY", display_name: "ARMAF CDN PRIVATE KEY" }),
    row({ id: "c", my_offer_price: null, landed_likely: 1000, low_sell: 1200, brand: "ADIDAS", name: "ICE DIVE", display_name: "ADIDAS ICE DIVE", upcs: "3412240000000" }),
    row({ id: "d", upcs: "6290360590000", my_offer_price: 1500, landed_likely: null, low_sell: 1400, brand: "AFNAN", name: "9PM", display_name: "AFNAN 9PM" }),
  ];
  it("keeps every row of my own list when narrowed to it", () => {
    expect(filterView(rows.filter((r) => r.my_offer_price != null), "wholesale", "offer").map((r) => r.id)).toEqual(["a", "b", "d"]);
  });
  it("unnarrowed Wholesale shows items priced by a competitor and by me (supplier cost or my offer)", () => {
    expect(filterView(rows, "wholesale").map((r) => r.id)).toEqual(["a", "c", "d"]);
  });
  it("finds the item by the words on my own list, any order", () => {
    expect(searchRows(rows, "club de nuit").map((r) => r.id)).toEqual(["a"]);
    expect(searchRows(rows, "intense nuit").map((r) => r.id)).toEqual(["a"]);
    expect(searchRows(rows, "105903").map((r) => r.id)).toEqual(["a"]);
    expect(searchRows(rows, "6085010044712").map((r) => r.id)).toEqual(["a"]);
    expect(searchRows(rows, "cdn private").map((r) => r.id)).toEqual(["b"]);
  });
  it("offer vs lowest competitor reads as raise / lower", () => {
    expect(wholesaleAction(2500 - 2250)).toBe("Under by $2.50 — can raise");
    expect(wholesaleAction(1400 - 1500)).toBe("Over by $1.00 — lower to compete");
  });
});

describe("my offer margin is measured, never added on top", () => {
  it("the grid computes (offer − my cost) ÷ offer from my inventory cost only — never a supplier price (owner 2026-11-14)", () => {
    const src = readFileSync(new URL("./desk.service.ts", import.meta.url), "utf8");
    expect(src).not.toContain("const offerCost = (myCost ?? (row.landed_likely as number | null)) ?? null;");
    expect(src).toContain("myCost != null ? Math.round(((myOffer - myCost) / myOffer) * 1000) / 10 : null");
    expect(src).toContain('{ key: "offer_margin_pct", label: "My offer margin %", group: "Mine", kind: "pct" }');
  });
});
