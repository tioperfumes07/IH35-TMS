import { describe, expect, it } from "vitest";
import { isFuelDeltaSuspicious } from "../fuel-reconciliation.routes.js";

describe("fuel reconciliation heuristics", () => {
  it("flags deltas beyond the default 10% threshold", () => {
    expect(isFuelDeltaSuspicious(1000, 940)).toBe(false);
    expect(isFuelDeltaSuspicious(1000, 880)).toBe(true);
  });

  it("uses the larger side as the denominator", () => {
    expect(isFuelDeltaSuspicious(50, 500)).toBe(true);
    expect(isFuelDeltaSuspicious(500, 50)).toBe(true);
  });
});
