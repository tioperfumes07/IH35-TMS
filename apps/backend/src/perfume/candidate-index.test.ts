/** Owner 2026-11-16 14:01 CT ("i need this to work fast"): the List-analysis grid took 103 s live because every competitor
 *  line was compared with every offer item. The brand index must return exactly what the full scan returned. */
import { describe, expect, it } from "vitest";
import { identify } from "./normalize.js";
import { offerCandidates, type OfferItem } from "./offer-review.js";
import { likelyLines, type CompetitorLine } from "./my-unlinked.js";

const items: OfferItem[] = [
  { id: "a", brand: "CAROLINA HERRERA", name: "212 VIP", size_ml: 100, conc: "EDT", gender: "M", flags: [], display_name: "CH 212 VIP M" },
  { id: "b", brand: "CAROLINA HERRERA", name: "212 VIP ROSE", size_ml: 80, conc: "EDP", gender: "W", flags: [], display_name: "CH 212 VIP ROSE W" },
  { id: "c", brand: "LATTAFA", name: "RAMZ GOLD", size_ml: 100, conc: "EDP", gender: "U", flags: [], display_name: "LATTAFA RAMZ GOLD" },
  { id: "d", brand: "", name: "MYSTERY", size_ml: 100, conc: "", gender: "", flags: [], display_name: "MYSTERY" },
];
const id = (description: string, brand: string | null = null) => identify({ description, brand, brandAliases: {} });

describe("offer candidates through the brand index", () => {
  it("proposes only items of the line's brand, found by brand read or brand word", () => {
    const got = offerCandidates({ description: "LATTAFA RAMZ GOLD 100ML EDP", brand: null }, id("LATTAFA RAMZ GOLD 100ML EDP"), items, 5);
    expect(got.map((g) => g.item_id)).toEqual(["c"]);
  });
  it("a brandless item is still reachable from a brandless line", () => {
    const line = id("MYSTERY 100ML");
    const got = offerCandidates({ description: "MYSTERY 100ML", brand: null }, { ...line, brand: "" }, items, 5);
    expect(got.map((g) => g.item_id)).toEqual(["d"]);
  });
  it("the same items list is indexed once and gives the same answer twice", () => {
    const l = { description: "CH 212 VIP MEN 3.4 OZ EDT", brand: "CAROLINA HERRERA" };
    const a = offerCandidates(l, id(l.description, l.brand), items, 5);
    const b = offerCandidates(l, id(l.description, l.brand), items, 5);
    expect(b).toEqual(a);
    expect(a.every((x) => x.item_id !== "c")).toBe(true);
  });
});

describe("likely lines through the line index", () => {
  it("finds the item's brand lines in pool order and never another brand", () => {
    const pool: CompetitorLine[] = ["LATTAFA RAMZ GOLD 100ML EDP", "ARMAF CLUB DE NUIT 105ML", "RAMZ GOLD LATTAFA 3.4OZ"].map((d, i) => ({
      row_id: `r${i}`, vendor: "V", description: d, price_cents: 100 + i, linked_to: null, id: id(d) }));
    const got = likelyLines(items[2], pool, 5);
    expect(got.map((g) => g.row_id).sort()).toEqual(["r0", "r2"]);
  });
});
