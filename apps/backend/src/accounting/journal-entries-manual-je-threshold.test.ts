import { describe, it, expect } from "vitest";
import { canCreateManualJeAtAmount, MANUAL_JE_OWNER_THRESHOLD_CENTS } from "./journal-entries.service.js";

describe("MANUAL-JE-HUB-CREATE — amount-threshold gate on CREATE (mirrors void's Owner-tier bar)", () => {
  it("below threshold: existing role gate is unchanged (any accounting-access role may create)", () => {
    const belowThreshold = MANUAL_JE_OWNER_THRESHOLD_CENTS - 1;
    expect(canCreateManualJeAtAmount("Owner", belowThreshold)).toBe(true);
    expect(canCreateManualJeAtAmount("Administrator", belowThreshold)).toBe(true);
    expect(canCreateManualJeAtAmount("Accountant", belowThreshold)).toBe(true);
    expect(canCreateManualJeAtAmount(null, belowThreshold)).toBe(true);
  });

  it("at/above threshold: Owner only (Administrator + Accountant excluded, same bar as void)", () => {
    expect(canCreateManualJeAtAmount("Owner", MANUAL_JE_OWNER_THRESHOLD_CENTS)).toBe(true);
    expect(canCreateManualJeAtAmount("Administrator", MANUAL_JE_OWNER_THRESHOLD_CENTS)).toBe(false);
    expect(canCreateManualJeAtAmount("Accountant", MANUAL_JE_OWNER_THRESHOLD_CENTS)).toBe(false);
    expect(canCreateManualJeAtAmount(null, MANUAL_JE_OWNER_THRESHOLD_CENTS)).toBe(false);
    expect(canCreateManualJeAtAmount(undefined, MANUAL_JE_OWNER_THRESHOLD_CENTS + 1_000_000)).toBe(false);
  });

  it("threshold constant is a single positive-cents source of truth (Owner-configurable in ONE place)", () => {
    expect(MANUAL_JE_OWNER_THRESHOLD_CENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MANUAL_JE_OWNER_THRESHOLD_CENTS)).toBe(true);
  });
});
