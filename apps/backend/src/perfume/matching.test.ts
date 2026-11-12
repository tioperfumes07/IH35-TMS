import { describe, expect, it } from "vitest";
import { addItem, displayNameOf, emptyIndex, matchLine, type MatchIndex } from "./matching.js";
import { identify, looseKey } from "./normalize.js";

/** Builds an index the way an import does: a new item per brand+UPC line from a buy vendor. */
function seed(lines: Array<{ upc: string; brand: string; description: string }>): MatchIndex {
  const ix = emptyIndex();
  lines.forEach((l, i) => {
    const m = matchLine(ix, "pca", { ...l, sku: `I${i}` }, { allowNewItem: true });
    expect(m.method).toBe("new_item");
    const id = `item-${i}`;
    addItem(ix, { id, brand: m.identity.brand, name: m.identity.nameText, sizeMl: m.identity.sizeMl, conc: m.identity.conc,
      gender: m.identity.gender, flags: m.identity.flags, identityKey: m.identity.key, looseKey: looseKey(m.identity), displayName: displayNameOf(m.identity) });
    ix.byUpc.set(m.upc, id);
  });
  return ix;
}

// Real lines from the 2026-11-10 Perfume Center of America list.
const PCA = [
  { upc: "8411061043868", brand: "Carolina Herrera", description: "212 (M) EDT SP 3.4oz(NEW PACK)(ONLY USA)(LI FREE)" },
  { upc: "8411061865439", brand: "Carolina Herrera", description: "212 SEXY(W)EDP SP 3.4oz(NEW PACK)(ONLY USA)" },
  { upc: "844061018099", brand: "Perry Ellis", description: "360 (M) EDT SP 3.4oz" },
];

describe("PERFUME-DESK matching", () => {
  it("same UPC from another vendor links by UPC", () => {
    const ix = seed(PCA);
    const m = matchLine(ix, "mtz", { upc: "8411061043868", brand: "CAROLINA HERRERA", description: "212 3.4 EDT M  (100033) - Spain" }, { allowNewItem: true });
    expect([m.method, m.itemId]).toEqual(["upc", "item-0"]);
  });

  it("a DIFFERENT UPC for the same bottle links by identity (MTZ 212 SEXY 8411061088173 vs PCA 8411061865439)", () => {
    const ix = seed(PCA);
    const m = matchLine(ix, "mtz", { upc: "8411061088173", brand: "CAROLINA HERRERA", description: "212 SEXY 3.4 EDP L  (100028) - Spain - 15pcs ByBox" }, { allowNewItem: true });
    expect([m.method, m.itemId]).toEqual(["key", "item-1"]);
  });

  it("brand-less list (La Esperanza) links when exactly one item has the same name, size, type and gender", () => {
    const ix = seed(PCA);
    const m = matchLine(ix, "esperanza", { description: "212 SEXY W 3.4oz EDP" }, { allowNewItem: false });
    expect([m.method, m.itemId]).toEqual(["loose_key", "item-1"]);
    const brandInText = matchLine(ix, "esperanza", { description: "CH 212 SEXY 3.4 EDP MUJER" }, { allowNewItem: false });
    expect([brandInText.method, brandInText.itemId]).toEqual(["key", "item-1"]);
  });

  it("never auto-links a different fragrance — it goes to review with suggestions", () => {
    const ix = seed(PCA);
    const sexyMen = matchLine(ix, "esperanza", { description: "212 SEXY M 3.4oz EDT" }, { allowNewItem: false });
    expect(sexyMen.itemId).toBeNull();
    expect(sexyMen.status).toBe("review");
    expect(sexyMen.suggestions[0].item_id).toBe("item-0");      // 212 M is suggested, not linked
    const red = matchLine(ix, "mtz", { upc: "608940515617", brand: "PERRY ELLIS", description: "360 RED 3.4 EDT M  (100074) - USA" }, { allowNewItem: true });
    expect(red.method).toBe("new_item");                          // its own item, never "360"
  });

  it("brand-less line without a unique twin is NOT created as an item", () => {
    const ix = seed(PCA);
    const m = matchLine(ix, "esperanza", { description: "ANIMALE BLACK M 3.4oz" }, { allowNewItem: false });
    expect(m.itemId).toBeNull();
    expect(m.method).toBeNull();
  });

  it("identity of the same bottle written five ways is one key", () => {
    const k = (d: string, b?: string) => identify({ description: d, brand: b }).key;
    expect(k("212 SEXY 100ML EDP MUJER", "CH")).toBe(k("212 SEXY(W)EDP SP 3.4oz", "Carolina Herrera"));
  });
});

describe("PERFUME-DESK matching — real MTZ 11/10/2026 lines (LST-F12013)", () => {
  it("a brand-only bottle WITH its barcode becomes an item ('4711 3.4 EDC U')", () => {
    const m = matchLine(emptyIndex(), "mtz", { upc: "4011700748945", brand: "4711", description: "4711 3.4 EDC U  (130562) - Germany - 30pcs ByBox" }, { allowNewItem: true });
    expect(m.method).toBe("new_item");
    expect(m.identity.nameText).toBe("4711");
  });
  it("a brand-only line with NO barcode is never created by itself (DIOR HOMME COLOGNE rule stays)", () => {
    const m = matchLine(emptyIndex(), "mtz", { brand: "4711", description: "4711 3.4 EDC U", sku: "130562" }, { allowNewItem: true });
    expect(m.method).not.toBe("new_item");
  });
  it("a no-barcode tester with the vendor's own code becomes its own item, flagged TESTER", () => {
    const m = matchLine(emptyIndex(), "mtz", { brand: "ARABIYAT", sku: "139920", description: "ARABIYAT SUGAR COOKIE DOUGH 3.4 EDP L TST  (139920) - United Arab Emir" }, { allowNewItem: true });
    expect(m.method).toBe("new_item");
    expect(m.identity.flags).toContain("TESTER");
  });
});


// Real lines from La Esperanza "LISTA N 5" (competitor, no UPCs) — audit 2026-11-12.
describe("PERFUME-DESK name match for lines without a barcode (5b)", () => {
  const SUP = [
    { upc: "3614273316309", brand: "Tous", description: "TOUS BABY (W) EDC SP 3.4oz" },
    { upc: "3349668508587", brand: "Paco Rabanne", description: "1 MILLION (M) EDT SP 3.4oz" },
    { upc: "3349668508588", brand: "Paco Rabanne", description: "1 MILLION (M) EDP SP 3.4oz" },
    { upc: "7640111493648", brand: "Animale", description: "ANIMALE (M) EDT SP 3.4oz" },
  ];
  it("a line that omits gender links to the ONE item with that name, size and type", () => {
    const m = matchLine(seed(SUP), "esp", { description: "TOUS BABY 3.4oz EDC" }, { allowNewItem: false });
    expect([m.method, m.itemId]).toEqual(["name", "item-0"]);
  });
  it("glued size+type (3.4ozEDT) is read as size and type", () => {
    const id = identify({ description: "PACO R ONE MILLION M 3.4ozEDT" });
    expect([id.brand, id.nameWords.join(" "), id.sizeMl, id.conc, id.gender]).toEqual(["PACO RABANNE", "1 MILLION", 100, "EDT", "M"]);
    expect(identify({ description: "ARMAF ODYSSEY FEMME BLACK2.7oz" }).sizeMl).toBe(80);
    expect(identify({ description: "CK ETERNITY W 3PCSET" }).flags).toContain("SET");
  });
  it("two real products fit (EDT and EDP on file, line prints no type) → review, never a pick", () => {
    const m = matchLine(seed(SUP), "esp", { description: "PACO R ONE MILLION M 3.4oz" }, { allowNewItem: false });
    expect(m.itemId).toBeNull();
  });
  it("a printed type that disagrees never links", () => {
    const m = matchLine(seed(SUP), "esp", { description: "TOUS BABY 3.4oz EDP" }, { allowNewItem: false });
    expect(m.itemId).toBeNull();
  });
  it("a brand-only line links to that brand's no-name item only", () => {
    const m = matchLine(seed(SUP), "esp", { description: "ANIMALE M 3.4oz EDT" }, { allowNewItem: false });
    expect([m.method, m.itemId]).toEqual(["name", "item-3"]);
  });
  it("a line WITH a barcode never uses the name tier", () => {
    const m = matchLine(seed(SUP), "esp", { upc: "1234567890123", description: "TOUS BABY 3.4oz EDC" }, { allowNewItem: false });
    expect(m.method).not.toBe("name");
  });
});

describe("PERFUME-DESK suggestions never cross product kinds (owner 2026-11-12)", () => {
  it("a single bottle is never offered a SET, a tester or a mini", () => {
    const ix = seed([
      { upc: "3614273000001", brand: "Giorgio Armani", description: "ARMANI CODE (M) EDT SP 4.2oz + 0.5 PARFUM SP SET" },
      { upc: "3614273000002", brand: "Giorgio Armani", description: "ARMANI CODE (M) EDT SP 4.2oz TESTER" },
    ]);
    const m = matchLine(ix, "esp", { description: "ARMANI CODE M 4.2 EDP" }, { allowNewItem: false });
    expect(m.itemId).toBeNull();
    expect(m.suggestions.map((s) => s.display_name).filter((n) => /SET|TESTER/.test(n))).toEqual([]);
  });
});
