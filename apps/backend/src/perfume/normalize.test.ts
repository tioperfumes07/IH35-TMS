import { describe, expect, it } from "vitest";
import { categoryOf, identify, looseKey, normalizeUpc, ozToMl, vendorLineTail } from "./normalize.js";

const loose = (d: string, brand?: string) => looseKey(identify({ description: d, brand }));

describe("PERFUME-DESK identity — owner's own examples (2026-11-12)", () => {
  it("212 SEXY for women: L / W / WOMAN / LADIES / MUJER, 3.3 / 3.4 / 100ML are one bottle", () => {
    const lines = [
      "212 SEXY 3.4 EDP L  (100028) - Spain - 15pcs ByBox",   // Miami Trading Zone
      "212 SEXY(W)EDP SP 3.4oz(NEW PACK)(ONLY USA)",         // Perfume Center of America
      "CH 212 SEXY 3.4 EDP WOMAN",
      "212 SEXY 3.4 EDP LADIES",
      "212 SEXY 100ML EDP MUJER",
      "212 SEXY 3.3 EDP W",
      "212 SEXY W 3.4oz EDP",
    ];
    const keys = new Set(lines.map((l) => loose(l)));
    expect([...keys]).toEqual(["212 SEXY|100|EDP|W|"]);
  });

  it("212 SEXY for men: M / MEN / MAN / HOMBRE are one bottle", () => {
    const lines = ["212 SEXY MEN 3.4 EDT", "212 SEXY MAN 3.4 EDT", "212 SEXY HOMBRE 3.4 EDT", "212 SEXY M 3.4oz EDT",
      "212 SEXY 3.4 EDT M  (100033) - Spain - 15pcs ByBox"];
    expect([...new Set(lines.map((l) => loose(l)))]).toEqual(["212 SEXY|100|EDT|M|"]);
  });

  it("212 for men: M / MAN / MEN / HOMBRE / CABALLERO / (M) are one bottle", () => {
    const lines = ["212 M 3.4oz EDT", "212 MAN 3.4 EDT", "212 MEN 3.4 EDT", "212 HOMBRE 3.4 EDT", "212 CABALLERO 3.4 EDT",
      "212 (M) EDT SP 3.4oz(NEW PACK)(ONLY USA)(LI FREE)", "212 3.4 EDT M  (100033) - Spain"];
    expect([...new Set(lines.map((l) => loose(l)))]).toEqual(["212|100|EDT|M|"]);
  });

  it("never merges different fragrances that share words", () => {
    expect(loose("212 SEXY M 3.4oz EDT")).not.toBe(loose("212 M 3.4oz EDT"));
    expect(loose("360 RED M 3.4oz EDT")).not.toBe(loose("360 M 3.4oz EDT"));
    expect(loose("360 COLLECTION NOIR MEN 3.4OZ EDT")).not.toBe(loose("360 M 3.4oz EDT"));
    expect(loose("212 SEXY W 3.4oz EDP")).not.toBe(loose("212 SEXY M 3.4oz EDP"));      // gender
    expect(loose("212 VIP W 2.7oz EDP")).not.toBe(loose("212 VIP W 4.2oz EDP"));        // size
    expect(loose("COOL WATER M 4.2 EDT")).not.toBe(loose("COOL WATER M 4.2 EDP"));      // type
    expect(loose("212 (M)(T) EDT SP 3.4oz(CAP&BOX)")).not.toBe(loose("212 (M) EDT SP 3.4oz")); // tester
  });

  it("fragrance names that look like gender words stay in the name", () => {
    expect(identify({ description: "BVLGARI MAN IN BLACK 3.4 PARFUM" }).nameText).toBe("MAN IN BLACK");
    expect(identify({ description: "BURBERRY HER EDP 3.4oz", brand: "Burberry" }).nameText).toBe("HER");
    expect(identify({ description: "LADY MILLION 2.7 EDP L" }).nameText).toBe("LADY MILLION");
    expect(identify({ description: "ARMANI STRONGER W YOU INTENSELY" }).nameText).toBe("STRONGER WITH YOU INTENSELY");
  });

  it("brand short forms resolve and leave the name", () => {
    const a = identify({ description: "CH 212 SEXY 3.4 EDP WOMAN" });
    const b = identify({ description: "212 SEXY(W)EDP SP 3.4oz", brand: "Carolina Herrera" });
    expect(a.brand).toBe("CAROLINA HERRERA");
    expect(b.brand).toBe("CAROLINA HERRERA");
    expect(a.key).toBe(b.key);
    expect(identify({ description: "A.GRANDE CLOUD PINK W 3.4oz" }).brand).toBe("ARIANA GRANDE");
    expect(identify({ description: "GA-AQUA DE GIO PROFUNDO" }).brand).toBe("GIORGIO ARMANI");
  });

  it("sizes: ounces to the real bottle", () => {
    expect([3.3, 3.4, 1.7, 1.6, 6.7, 6.8, 4.2, 2.7, 1.0, 5.1].map(ozToMl)).toEqual([100, 100, 50, 50, 200, 200, 125, 80, 30, 150]);
    expect(identify({ description: "FRAICHE 150ML" }).sizeMl).toBe(150);
    expect(identify({ description: "COACH MINI W 4.5ML EDP" }).flags).toContain("MINI");
    expect(identify({ description: "1881 CERRUTI 3.4 EDT M" }).nameWords[0]).toBe("1881");
  });

  it("separate gender / size columns outrank the text", () => {
    const id = identify({ description: "ARMAF CONNOISSEUR EDP SP 3.4oz", gender: "Men  " });
    expect(id.gender).toBe("M");
  });

  it("UPC: digits only, leading zeros and Excel number artifacts removed", () => {
    expect(normalizeUpc("071249104590")).toBe("71249104590");
    expect(normalizeUpc("8411061043868.0")).toBe("8411061043868");
    expect(normalizeUpc("8.411061043868e+12")).toBe("8411061043868");
    expect(normalizeUpc("I0100305")).toBe("");      // a PCA item number in the UPC column is not a UPC
    expect(normalizeUpc("BSDKBD")).toBe("");
  });

  it("more owner words: DAMA / SENORA / MUJERES for women, HOMBRES / SENOR / VARON for men", () => {
    expect(loose("212 SEXY DAMA 3.4 EDP")).toBe("212 SEXY|100|EDP|W|");
    expect(loose("212 SEXY SEÑORA 3.4 EDP")).toBe("212 SEXY|100|EDP|W|");
    expect(loose("212 HOMBRES 3.4 EDT")).toBe("212|100|EDT|M|");
    expect(loose("212 VARON 3.4 EDT")).toBe("212|100|EDT|M|");
  });

  it("section headers: lines under WOMEN / MEN / SETS MEN inherit gender and set", () => {
    expect(looseKey(identify({ description: "212 SEXY 3.4 EDP", section: "WOMEN" }))).toBe("212 SEXY|100|EDP|W|");
    expect(looseKey(identify({ description: "212 SEXY 3.4 EDT", section: "MEN'S FRAGRANCES" }))).toBe("212 SEXY|100|EDT|M|");
    const set = identify({ description: "212 VIP 3.4 EDT + 3.4 SHOWER GEL", section: "SETS MEN" });
    expect(set.gender).toBe("M");
    expect(set.flags).toContain("SET");
    // the line's own gender beats the section
    expect(identify({ description: "212 SEXY W 3.4 EDP", section: "MEN" }).gender).toBe("W");
  });
});

describe("PERFUME-DESK identity — real MTZ 11/10/2026 lines (prod import 2026-11-12)", () => {
  it("brand-only bottle: '4711 3.4 EDC U' is gender U, named by its brand — never the name 'U'", () => {
    const id = identify({ description: "4711 3.4 EDC U  (130562) - Germany - 30pcs ByBox", brand: "4711" });
    expect(id.gender).toBe("U");
    expect(id.nameWords).toEqual([]);
    expect(id.nameText).toBe("4711");
    expect(id.sizeMl).toBe(100);
    expect(id.conc).toBe("EDC");
  });
  it("a set is its main bottle: '100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML' → 100% PASSION 100ml EDT M SET", () => {
    const id = identify({ description: "ABERCROMBIE 100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML  (136339) - USA - 6pcs ByBox", brand: "ABERCROMBIE" });
    expect(id.nameText).toBe("100% PASSION");
    expect(id.sizeMl).toBe(100);
    expect(id.conc).toBe("EDT");
    expect(id.gender).toBe("M");
    expect(id.flags).toContain("SET");
  });
  it("a name with a plus that is not followed by a size keeps it out of the set rule", () => {
    const id = identify({ description: "CK ONE SHOCK 3.4 EDT M" });
    expect(id.flags).not.toContain("SET");
  });
});

describe("PERFUME-DESK identity — same word, different spelling (owner 2026-11-12)", () => {
  it("CK ONE = CK 1", () => {
    expect(loose("CK ONE 3.4 EDT U")).toBe(loose("CK 1 3.4 EDT U"));
    expect(loose("CK ONE 200ML EDT UNISEX")).toBe(loose("CK 1 6.7 EDT U"));
  });
  it("CK B = CK BE = CK BEE", () => {
    const k = new Set(["CK B 6.7 EDT U", "CK BE 6.7 EDT U", "CK BEE 200ML EDT UNISEX"].map((l) => loose(l)));
    expect(k.size).toBe(1);
  });
  it("ONE MILLION = 1 MILLION, and the vendor's own words are what is shown", () => {
    const a = identify({ description: "ONE MILLION 3.4 EDT M", brand: "PACO RABANNE" });
    const b = identify({ description: "1 MILLION 3.4 EDT M", brand: "PACO RABANNE" });
    expect(a.key).toBe(b.key);
    expect(a.nameText).toBe("ONE MILLION");
  });
  it("different fragrances stay different (CK ONE vs CK ONE SHOCK)", () => {
    expect(loose("CK ONE 3.4 EDT U")).not.toBe(loose("CK ONE SHOCK 3.4 EDT M"));
  });
});

describe("PERFUME-DESK vendor line ending → code / country / case pack (owner 2026-11-12)", () => {
  it("MTZ: code, country, pieces per box", () => {
    expect(vendorLineTail("CK FREE 1.7 EDT M (101079) - France - 24pcs ByBox")).toEqual({ code: "101079", country: "France", casePack: 24 });
    expect(vendorLineTail("FRAGRANCE WORLD TROPICAL KISS 2.7 EDP L (130957) - United Arab Emir. - 36pcs ByBox"))
      .toEqual({ code: "130957", country: "United Arab Emirates", casePack: 36 });
    expect(vendorLineTail("GIVENCHY HOMME 3.4 EDT M (101798) - France - France - 24pcs ByBox")).toEqual({ code: "101798", country: "France", casePack: 24 });
    expect(vendorLineTail("389 BOADICEA - United Kingdom - 6pcs ByBox")).toEqual({ code: null, country: "United Kingdom", casePack: 6 });
  });
  it("a hyphen inside a name is never read as an ending", () => {
    expect(vendorLineTail("GA-AQUA DE GIO 3.4 EDT M")).toEqual({ code: null, country: null, casePack: null });
    expect(vendorLineTail("212 SEXY(W)EDP SP 3.4oz(NEW PACK)(ONLY USA)")).toEqual({ code: null, country: null, casePack: null });
  });
  it("CK FREE → brand CALVIN KLEIN, model FREE, 50 ml EDT M", () => {
    const id = identify({ description: "CK FREE 1.7 EDT M (101079) - France - 24pcs ByBox" });
    expect([id.brand, id.nameText, id.sizeMl, id.conc, id.gender]).toEqual(["CALVIN KLEIN", "FREE", 50, "EDT", "M"]);
  });
});

describe("PERFUME-DESK real lists 2026-11-12: JIZAN, Perfumes Plus (ALL BRANDS), Nandansons, Lux America, Darielle", () => {
  it("JIZAN: origin code after the size is the country, never the name", () => {
    const id = identify({ description: "AMOUAGE GUIDANCE (U) EDP 100 ml OM", brand: "AMOUAGE" });
    expect([id.brand, id.nameText, id.sizeMl, id.conc, id.gender]).toEqual(["AMOUAGE", "GUIDANCE", 100, "EDP", "U"]);
    expect(vendorLineTail("AMOUAGE GUIDANCE (U) EDP 100 ml OM").country).toBe("Oman");
    expect(vendorLineTail("BVLGARI MAN WOOD ESSENCE (M) PARFUM 60 ml IT").country).toBe("Italy");
  });
  it("JIZAN: TESTER is a flag, not part of the name; VICTORIA'S = VICTORIAS", () => {
    const t = identify({ description: "RALPH LAUREN POLO RED (M) TESTER W/CAP PARFUM 125 ml FR", brand: "RALPH LAUREN" });
    expect(t.nameText).toBe("POLO RED");
    expect(t.flags).toContain("TESTER");
    const v = identify({ description: "VICTORIA'S SECRET TEASE CANDY NOIR (W) EDP 50 ml US", brand: "VICTORIA'S SECRET" });
    expect(v.nameText).toBe("TEASE CANDY NOIR");
  });
  it("Perfumes Plus: L- / M- / MS- prefixes (with or without a space) and the trailing item number", () => {
    const a = identify({ description: "L-360 SEXY 3.3 EDP SPR - 13878" });
    expect([a.nameText, a.gender, a.sizeMl]).toEqual(["360 SEXY", "W", 100]);
    const b = identify({ description: "L- SARAH.J PARKER COVET 3.4 EDP SPR - 13827" });
    expect(b.nameWords).not.toContain("13827");
    const c = identify({ description: "MS-LATTAFA PRIDE PISA 3.4+20ML/6.7 PERFUMED EDP SPR  -  313244" });
    expect([c.gender, c.flags.includes("SET")]).toEqual(["M", true]);
    expect(vendorLineTail("L-360 SEXY 3.3 EDP SPR - 13878").code).toBe("13878");
  });
  it("Nandansons: the Item Type column carries gender + tester/set", () => {
    const t = identify({ description: "212 SEXY TESTER 3.4 EAU DE PARFUM SPRAY FOR WOMEN", brand: "CAROLINA HERRERA", gender: "W-TSTR" });
    expect([t.gender, t.flags.includes("TESTER"), t.nameText]).toEqual(["W", true, "212 SEXY"]);
    const s = identify({ description: "360 3 PCS SET FOR MEN: 3.4 EAU DE TOILETTE SPRAY + 0.25 EAU DE TOILETTE SPRAY + 3 OZ SHOWER GEL", brand: "PERRY ELLIS", gender: "M-SET" });
    expect([s.gender, s.flags.includes("SET")]).toEqual(["M", true]);
  });
  it("Darielle: Product Line ADP = ACQUA DI PARMA; Lux: AL HAMBRA = ALHAMBRA", () => {
    expect(identify({ description: "Colonia Pura EDC 100ml", brand: "ADP" }).brand).toBe("ACQUA DI PARMA");
    expect(identify({ description: "AL HAMBRA ANARCH 100ML EDP SPRAY" }).brand).toBe("ALHAMBRA");
  });
});

describe("PERFUME-DESK category (owner 2026-11-12): Women / Men / Set / Tester / Cosmetics / Various", () => {
  const cat = (d: string, extra: Partial<Parameters<typeof identify>[0]> = {}) => { const id = identify({ description: d, ...extra }); return categoryOf(id.gender, id.flags); };
  it("fragrances follow gender, then set / tester", () => {
    expect(cat("212 SEXY 3.4 EDP L", { brand: "CAROLINA HERRERA" })).toBe("Women");
    expect(cat("212 3.4 EDT M", { brand: "CAROLINA HERRERA" })).toBe("Men");
    expect(cat("212 SEXY TESTER 3.4 EAU DE PARFUM SPRAY FOR WOMEN", { brand: "CAROLINA HERRERA", gender: "W-TSTR" })).toBe("Tester Women");
    expect(cat("MS-LATTAFA PRIDE PISA 3.4+20ML/6.7 PERFUMED EDP SPR - 313244")).toBe("Set Men");
    expect(cat("CK ONE 3.4 EDT U")).toBe("Unisex");
  });
  it("cosmetics and various", () => {
    expect(cat("RED DOOR 6.8 BODY LOTION", { brand: "ELIZABETH ARDEN" })).toBe("Cosmetics");
    expect(cat("PERFUME BLOTTERS 100 PCS")).toBe("Various");
    expect(cat("VERSACE BACKPACK BLACK", { brand: "VERSACE" })).toBe("Various");
  });
  it("a barcode bag with no bottle size still becomes an item", async () => {
    const { matchLine, emptyIndex } = await import("./matching.js");
    const m = matchLine(emptyIndex(), "v", { upc: "8011003999999", brand: "VERSACE", description: "VERSACE BACKPACK BLACK" }, { allowNewItem: true });
    expect(m.method).toBe("new_item");
  });
});

describe("PERFUME-DESK identity — Marc Jacobs MTZ 11/10/2026 lines (owner 2026-11-12: 'marc jacobs … wrong data')", () => {
  const mj = (d: string) => identify({ description: d, brand: "MARC JACOBS" });
  it("keeps an ML size exactly as written — a 4 ML mini is 4 ml, a 1.2 ML vial is 1.2 ml", () => {
    expect(mj("MINI MARC JACOBS DAISY EVER SO FRESH 4ML EDP L  (134144) - Spain - 72pcs ByBox").sizeMl).toBe(4);
    expect(mj("VIAL MARC JACOBS PERFECT 1.2ML EDT L (125767) - France - 768pcs ByBox").sizeMl).toBe(1.2);
    expect(mj("MINI MARC JACOBS PERFECT 10ML EDP L  (137790) - Spain - 288pcs ByBox").sizeMl).toBe(10);
  });
  it("a leading MINI / VIAL is a flag and the brand after it is the brand, not part of the name", () => {
    const a = mj("MINI MARC JACOBS DAISY WILD 4ML EDP L  (137007) - Spain - 135pcs ByBox");
    expect(a.brand).toBe("MARC JACOBS");
    expect(a.nameText).toBe("DAISY WILD");
    expect(a.flags).toContain("MINI");
    const v = mj("VIAL MARC JACOBS DAISY WILD INTENSE 1.2ML EDP L  (134071) - France - 144pcs ByBox");
    expect(v.nameText).toBe("DAISY WILD INTENSE");
    expect(v.flags).toContain("MINI");
  });
  it("shows a name's own EAU but matches without it", () => {
    const a = mj("MARC JACOBS DAISY EAU SO FRESH 2.5 EDT L  (102774) - France - 12pcs ByBox");
    expect(a.nameText).toBe("DAISY EAU SO FRESH");
    expect(a.sizeMl).toBe(75);
    expect(a.conc).toBe("EDT");
    const b = mj("MARC JACOBS DAISY SO FRESH 2.5 EDT L");
    expect(b.key).toBe(a.key);
  });
  it("an EAU DE PARFUM phrase is still the concentration, never the name", () => {
    const a = mj("MARC JACOBS PERFECT EAU DE PARFUM 3.4 L");
    expect(a.conc).toBe("EDP");
    expect(a.nameText).toBe("PERFECT");
  });
});

describe("PERFUME-DESK identity — PCA 11/10/2026 puts the brand inside the line (owner 2026-11-12 Marc Jacobs)", () => {
  const pca = (d: string, b = "Marc Jacobs") => identify({ description: d, brand: b });
  it("a two-word brand inside the line leaves the name; the same bottle from MTZ and PCA is one key", () => {
    const p = pca("DAISY EAU SO FRESH MARC JACOBS(W)EDT SP 4.2oz(LI FREE)");
    expect(p.nameText).toBe("DAISY EAU SO FRESH");
    const mtz = identify({ description: "MARC JACOBS DAISY EAU SO FRESH 4.2 EDT L  (102775) - France - 12pcs ByBox", brand: "MARC JACOBS" });
    expect(p.key).toBe(mtz.key);
    expect(pca("DAISY MARC JACOBS EVER SO FRESH(W)EDP SP 2.5oz(LI FREE)").nameText).toBe("DAISY EVER SO FRESH");
    expect(pca("DAISY LOVE MARC JACOBS(W)EDT SP 3.4oz(LI FREE)").nameText).toBe("DAISY LOVE");
    expect(pca("DAISY MARC JACOBS(W)(T)EDT SP 3.4oz(CAP&BOX)").flags).toContain("TESTER");
    expect(pca("DAISY MARC JACOBS(W)(T)EDT SP 3.4oz(CAP&BOX)").nameText).toBe("DAISY");
  });
  it("the brand column's 'Mark Jacobs' typo is Marc Jacobs", () => {
    const p = pca("DAISY LOVE MARC JACOBS EAU SO SWEET(W)EDT SP 3.4oz(LI FREE)", "Mark Jacobs");
    expect(p.brand).toBe("MARC JACOBS");
    expect(p.nameText).toBe("DAISY LOVE EAU SO SWEET");
  });
  it("a one-word brand inside a name stays — MISS DIOR is not MISS", () => {
    expect(identify({ description: "MISS DIOR EDP 3.4 W", brand: "DIOR" }).nameText).toBe("MISS DIOR");
  });
});
