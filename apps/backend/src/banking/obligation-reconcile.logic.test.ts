import { describe, expect, it } from "vitest";
import { levenshtein, suggestionConfidence } from "./obligation-reconcile.logic.js";

describe("obligation-reconcile.logic", () => {
  it("computes levenshtein distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("scores close amount/date/description matches", () => {
    const hit = suggestionConfidence({
      amountCentsTxn: 10_000,
      amountCentsObl: 10_025,
      dateTxn: "2026-05-10",
      dateObl: "2026-05-12",
      descTxn: "loves fuel a",
      descObl: "loves fuel b",
    });
    expect(hit.passes).toBe(true);
    expect(hit.score).toBeGreaterThan(0.5);
  });

  it("rejects amount beyond tolerance", () => {
    const miss = suggestionConfidence({
      amountCentsTxn: 10_000,
      amountCentsObl: 10_600,
      dateTxn: "2026-05-10",
      dateObl: "2026-05-12",
      descTxn: "a",
      descObl: "a",
    });
    expect(miss.passes).toBe(false);
  });
});
