import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_OPTIMIZER_WEIGHTS,
  computeDeadheadPenalty,
  computeEligibilityScore,
  computeHosScore,
  computePerformanceScore,
  computeProximityScore,
  rankOptimalDrivers,
  scoreDriverCandidate,
} from "../driver-optimizer.service.js";

describe("driver-optimizer.service (B21-D8)", () => {
  const routesPath = resolve(import.meta.dirname, "../dispatch-refinements.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../driver-optimizer.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  const baseCandidate = {
    id: "00000000-0000-4000-8000-000000000010",
    first_name: "Alex",
    last_name: "Rivera",
    display_id: "d10",
    is_in_violation: false,
    minutes_until_violation: 660,
    endorsement_h: true,
    endorsement_n: true,
    endorsement_t: false,
    endorsement_x: false,
    recent_on_time_pct: 90,
    completed_loads_30d: 8,
    distance_to_pickup_miles: 25,
  };

  const baseCtx = {
    pickup_city: "Dallas",
    pickup_state: "TX",
    hazmat: false,
    trailer_type: "dry_van",
    required_endorsements: [] as string[],
  };

  it("registers optimal-drivers endpoint on dispatch refinements routes", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/loads/:loadId/optimal-drivers");
    expect(src).toContain("listOptimalDriversForLoad");
  });

  it("scores HOS, proximity, eligibility, performance, and deadhead with default weights", () => {
    expect(computeHosScore({ is_in_violation: false, minutes_until_violation: 660 })).toBeGreaterThan(90);
    expect(computeProximityScore(25)).toBeGreaterThan(computeProximityScore(200));
    expect(computeEligibilityScore(baseCandidate, { hazmat: true, required_endorsements: ["H"] }).eligible).toBe(true);
    expect(computePerformanceScore({ recent_on_time_pct: 90, completed_loads_30d: 8 })).toBeGreaterThan(70);
    expect(computeDeadheadPenalty(120)).toBeGreaterThan(0);

    const scored = scoreDriverCandidate(baseCandidate, baseCtx);
    expect(scored.total_score).toBeGreaterThan(0);
    expect(scored.breakdown.hos_score).toBeGreaterThan(0);
    expect(DEFAULT_OPTIMIZER_WEIGHTS.hos).toBe(0.35);
  });

  it("ranks eligible drivers above ineligible and returns top 10", () => {
    const good = scoreDriverCandidate(baseCandidate, baseCtx);
    const bad = scoreDriverCandidate(
      {
        ...baseCandidate,
        id: "00000000-0000-4000-8000-000000000011",
        is_in_violation: true,
        minutes_until_violation: 0,
        endorsement_h: false,
        distance_to_pickup_miles: 5,
      },
      { ...baseCtx, hazmat: true, required_endorsements: ["H"] }
    );
    const ranked = rankOptimalDrivers(
      Array.from({ length: 12 }, (_, i) =>
        scoreDriverCandidate(
          { ...baseCandidate, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, distance_to_pickup_miles: i * 10 },
          baseCtx
        )
      ).concat([bad, good]),
      10
    );
    expect(ranked).toHaveLength(10);
    expect(ranked[0].rank).toBe(1);
    expect(ranked.some((r) => r.driver_id === bad.driver_id)).toBe(false);
  });

  it("exports multi-factor scoring helpers from driver-optimizer.service", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("DEFAULT_OPTIMIZER_WEIGHTS");
    expect(src).toContain("rankOptimalDrivers");
    expect(src).toContain("views.drivers_with_hos_status");
    expect(src).toContain("endorsement_h");
  });

  it("dispatch refinements routes remain registered in backend index", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDispatchRefinementsRoutes");
  });
});
