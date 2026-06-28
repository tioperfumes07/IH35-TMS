import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldUseDevFixturesForMaintenance } from "../dev-fixtures.js";

// CODER-10 (BUGFIX-CLUSTER) — prod-stub guard.
// Production must NEVER serve fixture/stub strings. The maintenance triage fixtures are
// double-gated: NODE_ENV !== "production" AND ENABLE_DEV_FIXTURES === "1". This test locks
// that gate (so prod can never be un-gated) and the structural check below asserts every
// caller wraps the fixture payload behind the gate.
describe("dev-fixtures prod gate (CODER-10)", () => {
  it("NEVER serves fixtures in production, even with the flag explicitly on", () => {
    expect(shouldUseDevFixturesForMaintenance("production", "1")).toBe(false);
    expect(shouldUseDevFixturesForMaintenance("production", undefined)).toBe(false);
    expect(shouldUseDevFixturesForMaintenance("production", "0")).toBe(false);
  });

  it("does not serve fixtures in non-prod unless the flag is explicitly '1'", () => {
    expect(shouldUseDevFixturesForMaintenance("development", undefined)).toBe(false);
    expect(shouldUseDevFixturesForMaintenance("development", "0")).toBe(false);
    expect(shouldUseDevFixturesForMaintenance("test", "true")).toBe(false);
  });

  it("serves fixtures ONLY in non-prod with the flag on", () => {
    expect(shouldUseDevFixturesForMaintenance("development", "1")).toBe(true);
    expect(shouldUseDevFixturesForMaintenance("staging", "1")).toBe(true);
  });

  it("structural: every triageDevFixtures() return is wrapped behind the gate", () => {
    const src = readFileSync(
      resolve(__dirname, "../dashboard.routes.ts"),
      "utf8"
    );
    // No bare fixture return may exist without the gate call guarding the same handler.
    const fixtureReturns = (src.match(/return triageDevFixtures\(\)/g) || []).length;
    const gateCalls = (src.match(/if \(shouldUseDevFixturesForMaintenance\(\)\)/g) || []).length;
    expect(fixtureReturns).toBeGreaterThan(0);
    // Each fixture return must be paired with a gate check.
    expect(gateCalls).toBeGreaterThanOrEqual(fixtureReturns);
  });
});
