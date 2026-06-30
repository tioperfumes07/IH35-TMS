import { describe, it, expect } from "vitest";
import { canVoidCancel, VOID_CANCEL_EXECUTOR_ROLES } from "../void-cancel-authz.js";

// Jorge-locked 2026-06-29: void/cancel EXECUTORS = Owner | Administrator | Accountant. Everyone else
// must file a request for approval.
describe("void/cancel authorization — executors = Owner | Administrator | Accountant", () => {
  it("allows the three executor roles", () => {
    expect(canVoidCancel("Owner")).toBe(true);
    expect(canVoidCancel("Administrator")).toBe(true);
    expect(canVoidCancel("Accountant")).toBe(true);
  });

  it("denies every non-executor role (they must file a request)", () => {
    for (const role of ["Manager", "Dispatcher", "Safety", "Driver", "Mechanic", "SuperAdmin", "Bookkeeper"]) {
      expect(canVoidCancel(role)).toBe(false);
    }
  });

  it("denies missing/blank roles", () => {
    expect(canVoidCancel(null)).toBe(false);
    expect(canVoidCancel(undefined)).toBe(false);
    expect(canVoidCancel("")).toBe(false);
  });

  it("exposes the executor role list (kept in lockstep with the frontend hook)", () => {
    expect([...VOID_CANCEL_EXECUTOR_ROLES]).toEqual(["Owner", "Administrator", "Accountant"]);
  });
});
