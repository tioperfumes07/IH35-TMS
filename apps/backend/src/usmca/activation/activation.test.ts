/**
 * CLOSURE-13 — USMCA activation state machine unit tests.
 */
import { describe, it, expect } from "vitest";
import { canTransition, validateTransition, isChecklistComplete, CHECKLIST_ITEMS } from "./activation-state-machine.js";

describe("canTransition", () => {
  it("allows hidden → soft_launch", () => expect(canTransition("hidden", "soft_launch")).toBe(true));
  it("blocks hidden → full_active", () => expect(canTransition("hidden", "full_active")).toBe(false));
  it("allows any → rollback", () => {
    expect(canTransition("soft_launch", "rollback")).toBe(true);
    expect(canTransition("pilot_drivers", "rollback")).toBe(true);
    expect(canTransition("full_active", "rollback")).toBe(true);
  });
  it("allows rollback → hidden", () => expect(canTransition("rollback", "hidden")).toBe(true));
});

describe("validateTransition", () => {
  it("blocks transition when checklist incomplete", () => {
    const { valid } = validateTransition("hidden", "soft_launch", []);
    expect(valid).toBe(false);
  });

  it("allows rollback without checklist", () => {
    const { valid } = validateTransition("soft_launch", "rollback", []);
    expect(valid).toBe(true);
  });

  it("allows transition when checklist complete", () => {
    const softLaunchIds = CHECKLIST_ITEMS.filter((i) => i.required_for === "soft_launch").map((i) => i.id);
    const { valid } = validateTransition("hidden", "soft_launch", softLaunchIds);
    expect(valid).toBe(true);
  });
});

describe("isChecklistComplete", () => {
  it("returns false for empty completedIds", () => {
    expect(isChecklistComplete("soft_launch", [])).toBe(false);
  });
  it("returns true when all required items complete", () => {
    const ids = CHECKLIST_ITEMS.filter((i) => i.required_for === "soft_launch").map((i) => i.id);
    expect(isChecklistComplete("soft_launch", ids)).toBe(true);
  });
});
