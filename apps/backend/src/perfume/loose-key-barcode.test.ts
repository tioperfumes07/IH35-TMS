import { describe, expect, it } from "vitest";
import { addItem, displayNameOf, emptyIndex, matchLine } from "./matching.js";
import { looseKey } from "./normalize.js";
import { dateOrNull } from "./desk.service.js";

describe("brand-less line with its own barcode never links by name (owner 2026-11-14: PPW 'M-SP KING' $2.95 ≠ BHARARA KING)", () => {
  const ix = emptyIndex();
  const m = matchLine(ix, "mtz", { upc: "850050062035", brand: "BHARARA", description: "BHARARA KING 3.4 EDP M  (119483) - USA - 12pcs ByBox" }, { allowNewItem: true });
  addItem(ix, { id: "king", brand: m.identity.brand, name: m.identity.nameText, sizeMl: m.identity.sizeMl, conc: m.identity.conc,
    gender: m.identity.gender, flags: m.identity.flags, identityKey: m.identity.key, looseKey: looseKey(m.identity), displayName: displayNameOf(m.identity) });
  ix.byUpc.set(m.upc, "king");
  it("the knock-off line with a different UPC does not become BHARARA KING", () => {
    const r = matchLine(ix, "ppw", { upc: "819929011994", description: "M-SP KING 3.4 EDP SPR  -  312364" }, { allowNewItem: false });
    expect(r.itemId).not.toBe("king");
  });
  it("the same bottle by its own UPC still links", () => {
    const r = matchLine(ix, "nand", { upc: "850050062035", description: "BHARARA KING 3.4 EAU DE PARFUM SPRAY" }, { allowNewItem: false });
    expect(r.itemId).toBe("king");
  });
});

describe("purchase dates as the owner's file gives them", () => {
  it("reads ISO, US and Excel day numbers; refuses junk", () => {
    expect(dateOrNull("2026-11-01")).toBe("2026-11-01");
    expect(dateOrNull("11/1/26")).toBe("2026-11-01");
    expect(dateOrNull("11/03/2026")).toBe("2026-11-03");
    expect(dateOrNull("46327")).toBe("2026-11-01");
    expect(dateOrNull("13/45/26")).toBeNull();
    expect(dateOrNull("")).toBeNull();
  });
});
