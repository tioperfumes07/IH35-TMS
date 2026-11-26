// Owner 2026-11-26 15:56 CT: "if there are completely new items that do not share upc code with anyone, then they should be
// automatically created … if descriptions vary but are upc the same, then it is same. just description changed …
// ed hardy edp sp 3.4oz + 6.8ozb/l is the sme as ed hardy 2 pc set woman body set."
import { describe, expect, it } from "vitest";
import { addItem, displayNameOf, emptyIndex, matchLine } from "./matching.js";
import { identify, looseKey } from "./normalize.js";

function withItem(id: string, description: string, upc: string) {
  const ix = emptyIndex();
  const idn = identify({ description });
  addItem(ix, { id, brand: idn.brand, name: idn.nameText, sizeMl: idn.sizeMl, conc: idn.conc, gender: idn.gender, flags: idn.flags, identityKey: idn.key, looseKey: looseKey(idn), displayName: displayNameOf(idn) });
  ix.byUpc.set(upc, id);
  return ix;
}

describe("the barcode is the item", () => {
  it("same UPC, set worded another way (+ body lotion vs 2 PC BODY SET) → the same item", () => {
    const ix = withItem("eh", "ED HARDY EDP SP 3.4OZ + 6.8OZ B/L WOMAN SET", "737052525218");
    const m = matchLine(ix, "v1", { upc: "737052525218", description: "ED HARDY 2 PC SET WOMAN BODY SET" } as never, { allowNewItem: true });
    expect([m.itemId, m.method, m.status]).toEqual(["eh", "upc", "matched"]);
  });
  it("same UPC on a plain item and a '*(1PC)*' / '(4PCs)' line → the same item", () => {
    const ix = withItem("gv", "GLORIA VANDERBILT EDT 3.38OZ SP WOMAN", "3357554720012");
    expect(matchLine(ix, "fs", { upc: "3357554720012", description: "GLORIA VANDERBILT EDT 3.38OZ SP (L) *(2PCs)*" } as never, { allowNewItem: true }).method).toBe("upc");
  });
  it("a TESTER on the bottle's barcode is still another product → Review with the bottle first", () => {
    const ix = withItem("tf", "TOM FORD OUD MINERALE EDP 100ML UNISEX", "888066144254");
    const m = matchLine(ix, "v1", { upc: "888066144254", description: "TOM FORD OUD MINERALE EDP 100ML TESTER" } as never, { allowNewItem: true });
    expect([m.itemId, m.status, m.suggestions[0]?.item_id]).toEqual([null, "review", "tf"]);
  });
  it("a barcode no item carries, nothing alike, no size printed → created as a new item", () => {
    const m = matchLine(emptyIndex(), "ppw", { upc: "8034041522278", description: "M-COSTUME NATIONAL PARFUM SPR - 34211" } as never, { allowNewItem: true });
    expect([m.method, m.status]).toEqual(["new_item", "matched"]);
  });
});
