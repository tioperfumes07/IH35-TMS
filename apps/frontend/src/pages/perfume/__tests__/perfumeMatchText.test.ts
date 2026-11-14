import { describe, expect, it } from "vitest";
import { itemSaysMore } from "../perfumeMatchText";

describe("Review — my item shown once unless the filed item differs (owner 2026-11-14)", () => {
  it("same data in my wording and the item → shown once", () => {
    expect(itemSaysMore("ARMAF CLUB DE NUIT INTENSE MAN EDT 105ML (M)", "ARMAF · CLUB DE NUIT INTENSE MAN · 105 ml · EDT · Men")).toBeNull();
    expect(itemSaysMore("CK DEFY EDT 100ML (M)", "CALVIN KLEIN · CK DEFY · 100 ml · EDT · Men".replace("CALVIN KLEIN · ", ""))).toBeNull();
  });
  it("AZZ WTD … REFILL filed as the plain AZZARO WANTED → the difference is shown", () => {
    expect(itemSaysMore("AZZ WTD EDT SP100ML REFILL /MAD (M)", "AZZARO · WANTED · 100 ml · EDT · Men")).toBe("mine says REFILL");
  });
  it("a different size is shown", () => {
    expect(itemSaysMore("BURBERRY HER EDP 100ML (W)", "BURBERRY · HER · 50 ml · EDP · Women")).toBe("50 ml");
  });
});
