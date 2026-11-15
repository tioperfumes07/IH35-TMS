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
