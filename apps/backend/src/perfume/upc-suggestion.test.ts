// Owner 2026-11-15 20:10 CT: "if they have the upc in common or what?" — a line whose barcode is on an item of another kind
// (tester / set / body) is not linked, but that item is its FIRST suggestion, with the words' own % alike.
import { describe, expect, it } from "vitest";
import { addItem, emptyIndex, matchLine } from "./matching.js";

describe("same-UPC suggestion", () => {
  it("offers the item carrying the line's UPC first, never at a made-up 100%", () => {
    const ix = emptyIndex();
    addItem(ix, { id: "tf", brand: "TOM FORD", name: "OUD MINERALE", sizeMl: 100, conc: "EDP", gender: "U", flags: [], identityKey: "tf-k", looseKey: "tf-l", displayName: "TOM FORD · OUD MINERALE · 100 ml · EDP · Unisex" });
    ix.byUpc.set("888066144254", "tf");
    const m = matchLine(ix, "v1", { description: "TOM FORD OUD MINERALE EDP 100ML TESTER", brand: null, size_text: null, upc: "888066144254" } as never, { allowNewItem: false });
    expect(m.status).toBe("review");
    expect(m.itemId).toBeNull();
    expect(m.suggestions[0]?.item_id).toBe("tf");
    expect(m.suggestions[0]?.why).toMatch(/same UPC 888066144254/);
    expect(m.suggestions[0]?.why).toMatch(/line is TESTER, item is plain bottle/); // the kind difference is said, never hidden
  });
});
