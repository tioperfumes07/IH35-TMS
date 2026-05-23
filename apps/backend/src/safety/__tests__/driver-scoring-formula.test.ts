import { describe, expect, it } from "vitest";
import { computeDriverScoreFromCounts } from "../driver-scoring.service.js";

describe("driver scoring formula", () => {
  it("applies weighted penalty and floors at zero", () => {
    const scored = computeDriverScoreFromCounts({
      counts: { critical: 3, major: 4, minor: 6 },
      periodMiles: 1000,
    });
    expect(scored.score).toBe(44);
    expect(scored.score_per_1k_miles).toBe(44);
  });

  it("floors score to zero", () => {
    const scored = computeDriverScoreFromCounts({
      counts: { critical: 12, major: 0, minor: 0 },
      periodMiles: null,
    });
    expect(scored.score).toBe(0);
    expect(scored.score_per_1k_miles).toBeNull();
  });
});
