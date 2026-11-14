import { describe, expect, it } from "vitest";
import { likelyLines, type CompetitorLine } from "./my-unlinked.js";
import { BUILTIN_BRAND_ALIASES, identify } from "./normalize.js";
import type { OfferItem } from "./offer-review.js";

const line = (row_id: string, description: string, price_cents = 2500): CompetitorLine => ({
  row_id, vendor: "ESPERANZA", description, price_cents, linked_to: null,
  id: identify({ description, brand: null, size: null, gender: null, brandAliases: BUILTIN_BRAND_ALIASES }),
});
const mine: OfferItem = { id: "i1", brand: "ARMAF", name: "CLUB NUIT INTENSE", size_ml: 105, conc: "EDT", gender: "M", flags: [], display_name: "ARMAF · CLUB NUIT INTENSE · 105 ml · EDT · Men" };

describe("Match my list ↔ competitor — likely lines (owner 2026-11-14)", () => {
  it("proposes the same bottle first; never the women's bottle", () => {
    const lines = [
      line("a", "ARMAF CLUB DE NUIT INTENSE M EDT 3.6oz", 2600),
      line("b", "ARMAF CLUB DE NUIT INTENSE W EDP 3.6oz", 2600),
      line("c", "ARMAF CLUB DE NUIT ICONIC M EDP 3.6oz", 3000),
      line("d", "212 HEROES FOREVER YOUNG M EDT 3oz", 5550),
    ];
    const got = likelyLines(mine, lines);
    expect(got[0].row_id).toBe("a");
    expect(got.map((g) => g.row_id)).not.toContain("b");
    expect(got.map((g) => g.row_id)).not.toContain("d");
    expect(got[0].why).toContain("3/3 name words");
  });
  it("a different bottle with an extra word is shown lower and says why", () => {
    const got = likelyLines({ ...mine, name: "CLUB NUIT" }, [line("a", "ARMAF CLUB DE NUIT M EDT 3.6oz"), line("c", "ARMAF CLUB DE NUIT ICONIC M EDP 3.6oz")]);
    expect(got[0].row_id).toBe("a");
    const iconic = got.find((g) => g.row_id === "c");
    expect(iconic?.why).toContain("EXTRA WORDS: ICONIC");
    expect(iconic!.score).toBeLessThan(got[0].score);
  });
});
