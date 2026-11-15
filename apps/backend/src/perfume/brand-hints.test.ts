import { describe, expect, it } from "vitest";
import { identify, nameBrandIndex } from "./normalize.js";
import { compactKey } from "./matching.js";

/** Owner 2026-11-14 18:23 / 18:25 CT corrections on the ESPERANZA list — the brand, and sets. */
const b = (d: string, nameBrands: Record<string, string> = {}) => identify({ description: d, nameBrands }).brand;
describe("brands the owner named on the ESPERANZA list", () => {
  it("abbreviations and spellings", () => {
    expect(b("JESSICA S. FANCY LOVE W 3.4oz EDP")).toBe("JESSICA SIMPSON");
    expect(b("JESSICA S.FANCY GIRL W B/M 8.0oz")).toBe("JESSICA SIMPSON");
    expect(b("JLO LIVE W 3.4oz EDP")).toBe("JENNIFER LOPEZ");
    expect(b("JOVAN MUSK W 3.25oz")).toBe("JOVAN");
    expect(b("JUICY C GLISTENING AMBER W3.4ozEDP")).toBe("JUICY COUTURE");
    expect(b("HB BOSS BOTTLED BEYOND 3.4oz EDP M")).toBe("HUGO BOSS");
    expect(b("V&ROLF SPICE BOMB 3oZ EDT")).toBe("VIKTOR & ROLF");
    expect(b("MK WONDERLUST 4PC SET")).toBe("MICHAEL KORS");
    expect(b("SABRINA C. CHERRY BABY EDP 2.5oz")).toBe("SABRINA CARPENTER");
    expect(b("RALPH L. ROMANCE W 3.4oz EDP")).toBe("RALPH LAUREN");
    expect(b("PARIS H HEIRESS W 3.4oZ EDP")).toBe("PARIS HILTON");
    expect(b("UNAGRO III M 3.4oZ EDT")).toBe("EMANUEL UNGARO");
    expect(b("W/DEO 2.6oz DOLCE & GABBANA \"K\" M 2PC SET EDP")).toBe("DOLCE & GABBANA");
  });
  it("the fragrance name tells the brand", () => {
    expect(b("212 VIP ROSE 4.2oz")).toBe("CAROLINA HERRERA");
    expect(b("360 CORAL W EDP 3.4oz")).toBe("PERRY ELLIS");
    expect(b("POLO BLUE 6.7oz EDT M")).toBe("RALPH LAUREN");
    expect(b("SPIDERMAN 3.4oz EDT")).toBe("MARVEL");
    expect(b("IRON MAN 3.4oZ EDT")).toBe("MARVEL");
    expect(b("FROZEN ELSA 3.4oz EDT")).toBe("DISNEY");
    expect(b("HALLOWEEN KISS W 3.4oz EDT")).toBe("JESUS DEL POZO");
    expect(b("HOT W 3.4oz")).toBe("BENETTON");
    expect(b("Z-14 M SET 4.2")).toBe("HALSTON");
    expect(b("STALLION 53 BLUE")).toBe("EMPER");
  });
  it("cross-reference: a name only one brand owns across every vendor's items gives that brand", () => {
    const idx = nameBrandIndex([{ brand: "LATTAFA", name: "ASAD" }, { brand: "LATTAFA", name: "ASAD ZANZIBAR" }, { brand: "LATTAFA", name: "YARA" },
      { brand: "ARMAF", name: "BLUE HOMME" }, { brand: "DIOR", name: "BLUE" },
      // live 11-14: misspelled item brands must not teach a brand — "BURBERRY HER" under "BURBE", "GUESS UOMO" under a Ferragamo misspelling
      { brand: "XBURB", name: "BURBERRY HER" }, { brand: "XBURB", name: "BURBERRY HERO" }, { brand: "XBURB", name: "BURBERRY GODDESS" },
      { brand: "BURBERRY", name: "TOUCH" }, { brand: "GUESS", name: "SEDUCTIVE" }]);
    expect(b("ASAD 3.4oz EDP M", idx)).toBe("LATTAFA");
    expect(idx.BLUE).toBeUndefined(); // generic word, never a brand
    expect(idx.BURBERRY).toBeUndefined(); // a name that starts with a brand never teaches another brand
  });
});
describe("sets the owner said were missed", () => {
  for (const d of ["360 CORAL W CANISTER", "360 W TRIO 1oz", "MARVEL FOR BOYS 4X25ML EDT COFFRET", "PRINCESS FOR GIRL 4X25ML COFRFRET EDT", "GUESS MARCIANO W 3PCS ET", "LATTAFA ASAD COLLECTION 4X25ML"]) {
    it(d, () => expect(identify({ description: d }).flags).toContain("SET"));
  }
  it("a set in a bag is a SET, not a bag", () => {
    const f = identify({ description: "GUESS SEDUCTIVE NOIR W 4PCS / BAG" }).flags;
    expect(f).toContain("SET");
    expect(f).not.toContain("VARIOUS");
  });
});
describe("the owner's own offer-list brand column (18:48 CT)", () => {
  const col = (brand: string, d = "X 100ML (M)") => identify({ description: d, brand }).brand;
  it("short brands map to the brand his vendors use", () => {
    expect(col("GIORA", "ACQUA DI GIO EDT 100ML (W)")).toBe("GIORGIO ARMANI");
    expect(col("HOL", "WAVE FOR HER EDP 100ML (W)")).toBe("HOLLISTER");
    expect(col("ISSEY")).toBe("ISSEY MIYAKE");
    expect(col("JDEL")).toBe("JESUS DEL POZO");
    expect(col("J DEL")).toBe("JESUS DEL POZO");
    expect(col("MONTB")).toBe("MONTBLANC");
    expect(col("MOSCH")).toBe("MOSCHINO");
    expect(col("NAUTI")).toBe("NAUTICA");
    expect(col("NARCISO RD")).toBe("NARCISO RODRIGUEZ");
    expect(col("NIN")).toBe("NINA RICCI");
    expect(col("SALVF")).toBe("SALVATORE FERRAGAMO");
    expect(col("THEIR")).toBe("MUGLER");
    expect(col("CAROH", "212 MEN EDT 100ML (M)")).toBe("CAROLINA HERRERA");
  });
  it("SIGNORINA / UOMO with no brand are Ferragamo", () => {
    expect(identify({ description: "SIGNORINA ELEGANZA EDP 100ML (W)" }).brand).toBe("SALVATORE FERRAGAMO");
    expect(identify({ description: "UOMO SALVATORE FERRAGAMO EDT 100ML (M)" }).brand).toBe("SALVATORE FERRAGAMO");
  });
});

describe("spacing typos are the same bottle (owner 19:03 CT: LOVEME AMETHYST = LOVE ME AMETHYST)", () => {
  it("compact keys agree", () => {
    const a = identify({ description: "TOUS LOVEME THE AMETHYST ELIXIR 90ML (W)" });
    const b = identify({ description: "TOUS LOVE ME THE AMETHYST ELIXIR 90 ML (W)" });
    expect(a.key).not.toBe(b.key);
    expect(compactKey(a.key)).toBe(compactKey(b.key));
  });
});
describe("DONNA, DKNY and DONNA KARAN are one brand (owner 19:11 CT)", () => {
  it("every spelling", () => {
    for (const d of ["DKNY GOLDEN DELICIOUS W EDP 3.4oz", "DONNA KARAN CASHMERE MIST 3.4oz"]) expect(identify({ description: d }).brand).toBe("DONNA KARAN");
    expect(identify({ description: "BE DELICIOUS EDP 100ML (W)", brand: "DONNA" }).brand).toBe("DONNA KARAN");
    expect(identify({ description: "BE DELICIOUS EDP 100ML (W)", brand: "DKNY" }).brand).toBe("DONNA KARAN");
  });
});
describe("ESPERANZA unmatched lines measured live 11-15", () => {
  it("a phrase one brand dominates teaches that brand (DAISY: MARC JACOBS 47, DISNEY Daisy Duck 2)", () => {
    const items = [...Array(47)].map((_, i) => ({ brand: "MARC JACOBS", name: `DAISY ${["LOVE", "WILD", "DREAM", ""][i % 4]}` }))
      .concat([{ brand: "DISNEY", name: "DAISY DUCK" }, { brand: "DISNEY", name: "DAISY DUCK 2" }, { brand: "DISNEY", name: "MICKEY" }]);
    const idx = nameBrandIndex(items);
    expect(idx["DAISY"]).toBe("MARC JACOBS");
    expect(identify({ description: "DAISY 3.4 EDT", nameBrands: idx }).brand).toBe("MARC JACOBS");
  });
  it("a phrase two brands really share teaches nothing", () => {
    const items = [...Array(6)].map(() => ({ brand: "RAVE", name: "NOW BLACK" })).concat([...Array(4)].map(() => ({ brand: "TOMMY HILFIGER", name: "NOW MEN" })));
    expect(nameBrandIndex(items)["NOW"]).toBeUndefined();
  });
  it("BMIST / B.M / B/MIST are a body mist; CAPITAN is CAPTAIN", () => {
    for (const d of ["PARIS HILTON HEIRESS BMIST 8OZ", "ARIANA GRANDE THANK YOU NEXT B.M 8OZ", "PARIS HILTON HEIRESS B/MIST 8OZ"])
      expect(identify({ description: d }).conc).toBe("MIST");
    expect(identify({ description: "CAPITAN AMERICA 3.4 EDT" }).brand).toBe("MARVEL");
  });
});
describe("ESPERANZA sets list pieces first, fragrance last (measured live 11-15)", () => {
  it("brand and name come from after the last piece; size/type from the main bottle", () => {
    const cases: Array<[string, string]> = [
      ["100ML+10ML DOLCE & GABBANA QUEEN W 3PC SET EDP", "DOLCE & GABBANA|QUEEN 3PC SET|100|EDP|W|SET"],
      ["6.7EDT+6.7BL+3.4SGEL+0.50EDT D&G LIGHT BLUE MEN 2PC SET", "DOLCE & GABBANA|LIGHT BLUE 2PC SET|200|EDT|M|SET"],
      ["3.4OZ+BL+0.5OZ TRAVEL SPRAY J CHOO L'EAU W 4PC SET", "JIMMY CHOO|LEAU 4PC SET|100|?|W|SET"],
      ["100ML EDP+100ML A/SHAVE+POUCH CRISTIANO R. CR7 GAME ON M 3PC SET", "CRISTIANO RONALDO|CR7 GAME ON 3PC SET|100|EDP|M|SET"],
    ];
    for (const [d, k] of cases) expect(identify({ description: d }).key.startsWith(k)).toBe(true);
  });
  it("a set that names its main bottle first is unchanged", () => {
    expect(identify({ description: "100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML" }).key.startsWith("?|100% PASSION|100|EDT|M|SET")).toBe(true);
  });
});
describe("HALLOWEEN is a JESUS DEL POZO line (owner 11-14)", () => {
  it("leading word or brand column — the house is the brand, HALLOWEEN stays in the name", () => {
    expect(identify({ description: "HALLOWEEN BLOSSOM W 3.4oz EDT" }).key.startsWith("JESUS DEL POZO|HALLOWEEN BLOSSOM|100|EDT|W")).toBe(true);
    expect(identify({ description: "BLOSSOM", brand: "HALLOWEEN" }).brand).toBe("JESUS DEL POZO");
    expect(identify({ description: "JESUS DEL POZO HALLOWEEN KISS W 3.4 EDT" }).key.startsWith("JESUS DEL POZO|HALLOWEEN KISS|")).toBe(true);
  });
  it("ESPERANZA short brand forms", () => {
    expect(identify({ description: "MAISON A SALVO M EDP 3.4oz" }).brand).toBe("MAISON ALHAMBRA");
    expect(identify({ description: "B.SPEARS PREROGATIVE 8OZ BMIST" }).brand).toBe("BRITNEY SPEARS");
    expect(identify({ description: "GLORIA VANDERVILT W 3.4 EDT" }).brand).toBe("GLORIA VANDERBILT");
  });
});
describe("item-master names with the house trailing or glued (measured live 11-15)", () => {
  it("same key as the vendor's spelling", () => {
    const k = (b: string, d: string) => identify({ brand: b, description: d }).key;
    expect(k("LANCOME", "IDOLE LANCOME 100ML EDP W")).toBe(identify({ description: "LANCOME IDOLE W 3.4 EDP" }).key);
    expect(k("ED HARDY", "ED HARDY LOVE&LUCK 100ML EDT M")).toBe(identify({ description: "ED HARDY LOVE LUCK M 3.4 EDT" }).key);
    expect(k("LACOSTE", "FRENCH PANACHE S 90ML EDT M")).toBe(identify({ description: "LACOSTE FRENCH PANACHE M 90ML EDT" }).key);
    expect(k("JEAN PAUL GAULTIER", "JEAN PAUL G SCANDAL 100ML EDP M")).toBe(identify({ description: "JEAN PAUL GAULTIER SCANDAL M 3.4 EDP" }).key);
  });
  it("a house word that is the whole name stays", () => {
    expect(identify({ description: "EAU DE LACOSTE 100ML EDT M", brand: "LACOSTE" }).nameWords.length).toBeGreaterThan(0);
  });
});
