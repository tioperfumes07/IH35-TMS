import { describe, expect, it } from "vitest";
import { addItem, displayNameOf, emptyIndex, matchLine } from "./matching.js";
import { identify, looseKey, sizesFar } from "./normalize.js";
import { offerCandidates, type OfferItem } from "./offer-review.js";
import { likelyLines } from "./my-unlinked.js";

// Owner 2026-11-14 15:19: "if one shows 100ml and another 105 or 120, its ok, but if one description has 100ml, it
// should not suggest the 60ml or 30ml" · "AZZ WTD EDP SP100ML REFILL … it is not the same item at all".
describe("size: 100 ↔ 105 / 120 suggested, 100 ↔ 60 / 30 never", () => {
  it("sizesFar", () => {
    expect([sizesFar(100, 105), sizesFar(100, 120), sizesFar(100, 125)]).toEqual([false, false, false]);
    expect([sizesFar(100, 60), sizesFar(100, 30), sizesFar(100, 50)]).toEqual([true, true, true]);
    expect([sizesFar(null, 30), sizesFar(100, null)]).toEqual([false, false]);
  });
  const item = (id: string, size: number): OfferItem => ({ id, brand: "AZZARO", name: "WANTED", size_ml: size, conc: "EDT", gender: "M", flags: [], display_name: `AZZARO WANTED ${size}` });
  it("their line 100 ml is offered my 100 ml item, never my 30 ml / 60 ml", () => {
    const d = "AZZARO WANTED 3.4oz EDT M";
    expect(offerCandidates({ description: d, brand: null }, identify({ description: d }), [item("a100", 100), item("a60", 60), item("a30", 30)]).map((c) => c.item_id)).toEqual(["a100"]);
  });
  it("my 100 ml item is offered their 100 ml line, never their 30 ml line", () => {
    const line = (row_id: string, d: string) => ({ row_id, vendor: "ESP", description: d, price_cents: 1000, linked_to: null, id: identify({ description: d }) });
    expect(likelyLines(item("a100", 100), [line("L100", "AZZARO WANTED 3.4oz EDT M"), line("L30", "AZZARO WANTED 1.0oz EDT M")]).map((c) => c.row_id)).toEqual(["L100"]);
  });
});

describe("REFILL is another product: a barcode never carries a refill line onto the plain bottle", () => {
  it("UPC on the plain item + a line that says REFILL → Review, not a UPC match", () => {
    const ix = emptyIndex();
    const id = identify({ description: "AZZARO WANTED 3.4 EDT SPRAY FOR MEN", brand: "AZZARO" });
    addItem(ix, { id: "plain", brand: id.brand, name: id.nameText, sizeMl: id.sizeMl, conc: id.conc, gender: id.gender, flags: id.flags, identityKey: id.key, looseKey: looseKey(id), displayName: displayNameOf(id) });
    ix.byUpc.set("3351500016617", "plain");
    const m = matchLine(ix, "offer", { upc: "3351500016617", brand: "AZZARO", description: "AZZ WTD EDT SP100ML REFILL /MAD (M)" }, { allowNewItem: true });
    expect(m.identity.flags).toContain("REFILL");
    expect([m.itemId, m.method, m.status]).toEqual([null, null, "review"]);
    // The same barcode on a plain line still links by UPC.
    expect(matchLine(ix, "nan", { upc: "3351500016617", brand: "AZZARO", description: "AZZARO WANTED 3.4 EAU DE TOILETTE SPRAY FOR MEN" }, { allowNewItem: true }).method).toBe("upc");
  });
});
