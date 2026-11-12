import { describe, expect, it } from "vitest";
import { closeCents, costFromPrice, landedCents, marginPct, markupPct, priceFromCost, rankOffers } from "./pricing.js";

describe("PERFUME-DESK pricing (cents)", () => {
  it("closed numbers — owner's example $20.37 → $20.50, and every step", () => {
    expect(closeCents(2037)).toBe(2050);
    expect(closeCents(10467)).toBe(10500);
    expect(closeCents(2050)).toBe(2050);                // already closed stays
    expect(closeCents(2037, "5")).toBe(2040);
    expect(closeCents(2037, "10")).toBe(2040);
    expect(closeCents(2037, "25")).toBe(2050);
    expect(closeCents(2026, "25")).toBe(2050);
    expect(closeCents(2037, "100")).toBe(2100);
    expect(closeCents(2037, "75")).toBe(2075);
    expect(closeCents(2080, "75")).toBe(2175);
    expect(closeCents(2037, "50", "down")).toBe(2000);
    expect(closeCents(2037, "50", "nearest")).toBe(2050);
    expect(closeCents(2024, "50", "nearest")).toBe(2000);
    expect(closeCents(2080, "75", "down")).toBe(2075);
  });

  it("landed cost: listed − cushion + freight", () => {
    expect(landedCents(2075, 25, 45)).toBe(2095);       // $20.75 − .25 + .45
    expect(landedCents(2075, 50, 35)).toBe(2060);       // $20.75 − .50 + .35
  });

  it("margin and markup are both shown and differ", () => {
    expect(marginPct(10000, 8400)).toBeCloseTo(16, 10);
    expect(markupPct(10000, 8400)).toBeCloseTo(19.047619, 5);
    expect(marginPct(null, 100)).toBeNull();
    expect(markupPct(100, 0)).toBeNull();
  });

  it("a $100.00 list price at 16%: margin → $84.00, markup → $86.21", () => {
    expect(costFromPrice(10000, 16, "margin")).toBe(8400);
    expect(costFromPrice(10000, 16, "markup")).toBe(8621);
    expect(costFromPrice(12999, 16, "markup")).toBe(11206); // Sauvage at Broadway $129.99
  });

  it("price from cost round-trips with the old workbook's margin formula", () => {
    expect(priceFromCost(8400, 16, "margin")).toBe(10000);
    expect(priceFromCost(4550, 15, "margin")).toBe(5353);   // old workbook: cost ÷ (1 − 15%)
    expect(priceFromCost(4550, 15, "markup")).toBe(5233);
    expect(() => priceFromCost(100, 100, "margin")).toThrow();
  });

  it("vendor ranking: likely cost decides, ties are flagged", () => {
    const r = rankOffers([
      { vendorId: "pca", listedCents: 7875, cushionLoCents: 25, cushionHiCents: 50, freightLoCents: 35, freightHiCents: 45 },
      { vendorId: "mtz", listedCents: 7925, cushionLoCents: 0, cushionHiCents: 25, freightLoCents: 35, freightHiCents: 45 },
      { vendorId: "nan", listedCents: 7900, cushionLoCents: 25, cushionHiCents: 25, freightLoCents: 35, freightHiCents: 45 },
    ]);
    expect(r.map((o) => [o.vendorId, o.likelyCents, o.rank, o.tied])).toEqual([
      ["pca", 7895, 1, false],
      ["nan", 7920, 2, false],
      ["mtz", 7970, 3, false],
    ]);
    const t = rankOffers([
      { vendorId: "a", listedCents: 1575, cushionLoCents: 0, cushionHiCents: 0, freightLoCents: 40, freightHiCents: 40 },
      { vendorId: "b", listedCents: 1575, cushionLoCents: 0, cushionHiCents: 0, freightLoCents: 40, freightHiCents: 40 },
    ]);
    expect(t.every((o) => o.rank === 1 && o.tied)).toBe(true);
  });
});
