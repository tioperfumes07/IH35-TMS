import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDeadheadCostCents,
  computeSuggestionScore,
  haversineMiles,
  rankLoadSuggestions,
  type NextLoadSuggestion,
} from "../optimizer.service.js";

describe("deadhead optimizer.service (GAP-76)", () => {
  const routesPath = resolve(import.meta.dirname, "../routes.ts");
  const indexPath = resolve(import.meta.dirname, "../../../index.ts");

  it("registers next-load-suggestions route", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/deadhead/next-load-suggestions");
    expect(src).toContain("findBestLoadForUnit");
  });

  it("wires deadhead optimizer routes in backend index", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDeadheadOptimizerRoutes");
  });

  it("computes haversine miles between coordinates", () => {
    const austinToDallas = haversineMiles(30.2672, -97.7431, 32.7767, -96.797);
    expect(austinToDallas).toBeGreaterThan(150);
    expect(austinToDallas).toBeLessThan(220);
    expect(haversineMiles(30.2672, -97.7431, 30.26721, -97.74311)).toBeLessThan(0.02);
  });

  it("scores suggestions as (revenue - deadhead_cost) / total_miles", () => {
    const deadheadCost = computeDeadheadCostCents(100);
    expect(deadheadCost).toBe(100 * 250);
    const score = computeSuggestionScore(500_00, 100, 400);
    expect(score).toBeCloseTo((500_00 - deadheadCost) / 500, 1);
  });

  it("ranks higher score first and respects top 5 limit", () => {
    const mk = (load_uuid: string, score: number, deadhead_miles: number): NextLoadSuggestion => ({
      load_uuid,
      load_number: null,
      pickup_city: "A",
      pickup_state: "TX",
      delivery_city: "B",
      delivery_state: "TX",
      deadhead_miles,
      loaded_miles: 100,
      total_miles: deadhead_miles + 100,
      est_revenue_cents: 1000_00,
      est_margin_cents: 900_00,
      score,
    });
    const ranked = rankLoadSuggestions(
      [mk("low", 1.2, 80), mk("high", 3.5, 20), mk("mid", 2.1, 40), mk("x", 4, 10), mk("y", 3.9, 12), mk("z", 0.5, 90)],
      5
    );
    expect(ranked).toHaveLength(5);
    expect(ranked[0].load_uuid).toBe("x");
    expect(ranked[1].load_uuid).toBe("y");
    expect(ranked[4].load_uuid).toBe("low");
  });

  it("returns empty ranking when no candidates supplied", () => {
    expect(rankLoadSuggestions([])).toEqual([]);
  });
});
