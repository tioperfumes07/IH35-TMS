/** Review narrowed to MY OFFER LIST (owner 2026-11-13) — real ESPERANZA lines measured live 11-13. Pure. */
import { describe, expect, it } from "vitest";
import { identify } from "./normalize.js";
import { offerCandidates, type OfferItem } from "./offer-review.js";

const item = (id: string, brand: string, name: string, size_ml: number | null, flags: string[] = []): OfferItem =>
  ({ id, brand, name, size_ml, flags, display_name: `${brand} · ${name} · ${size_ml} ml` });
const ITEMS: OfferItem[] = [
  item("milestone", "ARMAF", "CLUB NUIT MILESTONE", 110), // live item size; ESPERANZA says 3.4oz
  item("god", "ARIANA GRANDE", "GOD IS A", 100),
  item("redleather", "SALVATORE FERRAGAMO", "FERRAGAMO RED LEATHER", 100),
  item("hero", "JESUS DEL POZO", "HALLOWEEN HERO", 125),
  item("bliss", "ARMAF", "ISLAND BLISS DELIGHTS", 100),
  item("coachblue", "COACH", "BLUE", 100),
  item("vip", "CAROLINA HERRERA", "212 VIP", 125),
  { ...item("wanted", "AZZARO", "WANTED", 100), conc: "EDP" },
  { ...item("cdni", "ARMAF", "CLUB NUIT INTENSE", 110), gender: "M" },
];
const cands = (description: string) => offerCandidates({ description, brand: null }, identify({ description }), ITEMS).map((c) => c.item_id);

describe("review: only lines that can be one of my offer items", () => {
  it("links the owner's items from ESPERANZA wording", () => {
    expect(cands("ARMAF CLUB DE NUIT MILESTONE 3.4oz")).toEqual(["milestone"]);
    expect(cands("A.GRANDE GOD IS A WOMAN")).toEqual(["god"]);
    expect(cands("S.FERRAGAMO RED LEATHER M 3.3oz EDP")).toEqual(["redleather"]);
    expect(cands("HALLOWEEN HERO M 4.2oz EDT")).toEqual(["hero"]);
  });
  it("never proposes a different product", () => {
    expect(cands("ARMAF DELIGHTS ISLAND BLISS 4PC SET")).toEqual([]); // set ≠ bottle
    expect(cands("360 COLLECTION MAGNETIC BLUE 3.4oz EDT")).toEqual([]); // one shared word, no brand
  });
  it("an extra name word is a different bottle — never proposed; gender words are not extra", () => {
    expect(cands("212 VIP ROSE 4.2oz")).toEqual([]);
    expect(cands("AZZARO WANTED EDP INTENSE M 3.38")).toEqual([]);
    expect(cands("A.GRANDE GOD IS A WOMAN 3.4oz")).toEqual(["god"]);
  });
  it("a size difference is still proposed, scored lower, both sizes named — the owner decides", () => {
    const [m] = offerCandidates({ description: "ARMAF CLUB DE NUIT MILESTONE 3.4oz", brand: null }, identify({ description: "ARMAF CLUB DE NUIT MILESTONE 3.4oz" }), ITEMS);
    expect(m.item_id).toBe("milestone");
    expect(m.score).toBeLessThan(0.9);
    expect(m.why).toContain("SIZE DIFFERS: line 100 ml, your item 110 ml");
    const [god] = offerCandidates({ description: "A.GRANDE GOD IS A WOMAN 3.4oz", brand: null }, identify({ description: "A.GRANDE GOD IS A WOMAN 3.4oz" }), ITEMS);
    expect(god.why).toContain("size 100 ml");
  });
  it("engine suggestion bypass removed: extra-word item never shown as 'my item'", () => {
    // CDN CLUB NUIT ELITE has name words CDN+CLUB+NUIT+ELITE; line ARMAF CLUB NUIT ICONIC adds ICONIC = different bottle.
    const withElite = [...ITEMS, item("elite", "ARMAF", "CDN CLUB NUIT ELITE", 100)];
    const candsE = (d: string) => offerCandidates({ description: d, brand: null }, identify({ description: d }), withElite).map((c) => c.item_id);
    expect(candsE("ARMAF CLUB NUIT ICONIC")).toEqual([]);
    // CLUB NUIT INTENSE = different bottle than CLUB NUIT MILESTONE (extra word INTENSE vs MILESTONE).
    expect(cands("ARMAF CLUB NUIT OUD")).toEqual([]);
  });
  it("men vs women bottles are never paired; unisex or unknown on either side is not a conflict", () => {
    // my item is M; line is W → rejected
    expect(cands("ARMAF CLUB DE NUIT INTENSE W 3.6oz")).toEqual([]);
    // my item is M; line is M → accepted
    expect(cands("ARMAF CLUB DE NUIT INTENSE M 3.6oz")).toEqual(["cdni"]);
  });
  it("EDT / EDP / PARFUM differing is flagged", () => {
    const [w] = offerCandidates({ description: "AZZARO WANTED PARFUM 3.3oz", brand: null }, identify({ description: "AZZARO WANTED PARFUM 3.3oz" }), ITEMS);
    expect(w.item_id).toBe("wanted");
    expect(w.why).toContain("TYPE DIFFERS: line PARFUM, your item EDP");
    expect(w.score).toBeLessThan(0.9);
  });
});
