import { describe, expect, it } from "vitest";
import { identify } from "./normalize.js";
import { genderCheck, offerCandidates, type OfferItem } from "./offer-review.js";
import { likelyLines, type CompetitorLine } from "./my-unlinked.js";

/** Owner 2026-11-14 17:22 CT: "LIGHT BLUE MAN I MATCHED BY ACCIDENT TO LIGHT BLUE WOMAN … WHY IS IT RECOMMENDING FROM
 *  OTHER GENDERS. EMPORIO STRONG I ALSO CONFIRMED SUGGESTION AND IT WAS WRONG GENDER." Real lines from production. */
const item = (id: string, name: string, gender: string, size = 100, conc = "EDP", brand = "DOLCE & GABBANA"): OfferItem =>
  ({ id, brand, name, size_ml: size, conc, gender, flags: [], display_name: `${brand} · ${name} · ${size} ml · ${conc} · ${gender === "M" ? "Men" : "Women"}` });
const LB_M = item("lbm", "LIGHT BLUE", "M");
const LB_W = item("lbw", "LIGHT BLUE", "W");
const line = (d: string, vendor = "ESPERANZA"): CompetitorLine => ({ row_id: d, vendor, description: d, price_cents: 3000, linked_to: null, id: identify({ description: d }) });

describe("gender gate — no recommendation ever crosses Men / Women", () => {
  it("genderCheck: Men vs Women refused; unstated proposed lower and said plainly", () => {
    expect(genderCheck("M", "W").ok).toBe(false);
    expect(genderCheck("W", "M").ok).toBe(false);
    expect(genderCheck("M", "M")).toMatchObject({ ok: true, factor: 1 });
    expect(genderCheck("", "M")).toMatchObject({ ok: true, factor: 0.6 });
    expect(genderCheck("", "M").note).toContain("GENDER NOT STATED on the line");
    expect(genderCheck("M", "", "BRIT HER").ok).toBe(false); // the item's own name says Women
  });
  it("Esperanza 'D&G LIGHT BLUE 3.4oz EDP M' is proposed for my Men's Light Blue only, never the Women's", () => {
    const l = "D&G LIGHT BLUE 3.4oz EDP M";
    const out = offerCandidates({ description: l, brand: null }, identify({ description: l }), [LB_W, LB_M]);
    expect(out.map((o) => o.item_id)).toEqual(["lbm"]);
    expect(likelyLines(LB_W, [line(l)])).toEqual([]);
    expect(likelyLines(LB_M, [line(l)]).map((x) => x.row_id)).toEqual([l]);
  });
  it("'ARMANI STRONGER W YOU INTENSELY': W YOU is WITH YOU, not Women — the Men's item is proposed, flagged gender not stated", () => {
    const l = "ARMANI STRONGER W YOU INTENSELY";
    const id = identify({ description: l });
    expect(id.gender).toBe("");
    const sw = item("swm", "STRONGER WITH YOU INTENSELY", "M", 100, "EDP", "GIORGIO ARMANI");
    const out = offerCandidates({ description: l, brand: null }, id, [sw]);
    expect(out[0]?.why).toContain("GENDER NOT STATED on the line");
    expect(out[0]!.score).toBeLessThan(0.7);
  });
  it("W/CAP is 'with cap', never Women", () => {
    expect(identify({ description: "CREED AVENTUS TESTER W/CAP EDP 100 ml" }).gender).toBe("");
    expect(identify({ description: "CREED AVENTUS (M) TESTER W/CAP EDP 100 ml" }).gender).toBe("M");
  });
  it("a line with no gender ranks the stated-gender match below one that says it", () => {
    const said = offerCandidates({ description: "D&G LIGHT BLUE W 3.4oz EDP", brand: null }, identify({ description: "D&G LIGHT BLUE W 3.4oz EDP" }), [LB_W, LB_M]);
    expect(said.map((o) => o.item_id)).toEqual(["lbw"]);
    expect(said[0]!.why).toContain("gender Women = Women");
  });
});
