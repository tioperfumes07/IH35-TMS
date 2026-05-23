import { describe, expect, it } from "vitest";
import { canAccessDashcam } from "../dashcam-rbac.js";

describe("dashcam on-demand RBAC", () => {
  it("allows owner, administrator, safety_lead only", () => {
    expect(canAccessDashcam("Owner")).toBe(true);
    expect(canAccessDashcam("Administrator")).toBe(true);
    expect(canAccessDashcam("safety_lead")).toBe(true);
    expect(canAccessDashcam("Safety")).toBe(false);
    expect(canAccessDashcam("Dispatcher")).toBe(false);
  });
});
