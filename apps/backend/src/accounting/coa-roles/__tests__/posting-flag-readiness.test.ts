// Behaviour of the posting-flag readiness computation.
//
// THE DEFECT (2026-07-30): `/accounting/coa-roles/validate` returned `valid: true` and the CoA Roles
// screen said "All required roles have active mappings" while THREE posting features were dead on every
// entity. Their roles are classed OPTIONAL, so `required_roles` never mentioned them — but a poster
// resolves accounts through resolveRoleAccount(), which THROWS CoaRoleResolutionError when the role has
// no active binding. Green screen, dead feature. These tests pin the states that make that visible.
import { describe, expect, it } from "vitest";
import {
  computePostingFeatureReadiness,
  loadPostingFlagRequirements,
} from "../posting-flag-readiness.js";

const FLAG = "SAFETY_FINE_GL_POSTING_ENABLED";

const FIXTURE = {
  requirements: {
    [FLAG]: ["civil_fines_expense", "cash_clearing"],
    FUEL_CARD_OVERAGE_GL_POSTING_ENABLED: ["fuel_overage_receivable"],
  },
  labels: { [FLAG]: "Safety fine GL posting" },
};

const find = (rows: ReturnType<typeof computePostingFeatureReadiness>, flag: string) =>
  rows.find((r) => r.flag_key === flag);

describe("computePostingFeatureReadiness", () => {
  it("flags ON + unbound roles as armed_but_blocked — the state that throws in production", () => {
    const rows = computePostingFeatureReadiness(new Set(), new Set([FLAG]), FIXTURE);
    const row = find(rows, FLAG);
    expect(row?.armed_but_blocked).toBe(true);
    expect(row?.ready).toBe(false);
    expect(row?.missing_roles).toContain("civil_fines_expense");
  });

  it("does not call a feature armed when the flag is OFF, even with unbound roles", () => {
    const row = find(computePostingFeatureReadiness(new Set(), new Set(), FIXTURE), FLAG);
    expect(row?.ready).toBe(false);
    expect(row?.armed_but_blocked).toBe(false);
  });

  it("reports ready once every required role is bound", () => {
    const bound = new Set(["civil_fines_expense", "cash_clearing"]);
    const row = find(computePostingFeatureReadiness(bound, new Set([FLAG]), FIXTURE), FLAG);
    expect(row?.ready).toBe(true);
    expect(row?.armed_but_blocked).toBe(false);
    expect(row?.missing_roles).toEqual([]);
  });

  it("treats a PARTIALLY bound feature as blocked — one missing leg is enough to throw", () => {
    // Depreciation is the canonical case: expense DEBIT bound, accumulated-depreciation CREDIT not.
    const row = find(computePostingFeatureReadiness(new Set(["cash_clearing"]), new Set([FLAG]), FIXTURE), FLAG);
    expect(row?.ready).toBe(false);
    expect(row?.missing_roles).toEqual(["civil_fines_expense"]);
  });

  it("sorts armed_but_blocked first so the dangerous state cannot be buried", () => {
    const rows = computePostingFeatureReadiness(
      new Set(["fuel_overage_receivable"]),
      new Set([FLAG]),
      FIXTURE
    );
    expect(rows[0]?.armed_but_blocked).toBe(true);
    expect(rows[rows.length - 1]?.ready).toBe(true);
  });

  it("ships a real map that includes the flags which shipped broken posters", () => {
    const file = loadPostingFlagRequirements();
    // These three were ABSENT from the requirements map, which is why a migration could arm posters
    // whose roles have zero bindings on prod without any guard objecting.
    expect(Object.keys(file.requirements)).toEqual(
      expect.arrayContaining([
        "SAFETY_FINE_GL_POSTING_ENABLED",
        "PARTS_PURCHASE_GL_POSTING_ENABLED",
        "INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED",
      ])
    );
    for (const roles of Object.values(file.requirements)) {
      // A flag with no roles can never be reported blocked — it would check nothing.
      expect(roles.length).toBeGreaterThan(0);
    }
  });
});
