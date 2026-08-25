import { describe, expect, it } from "vitest";
import { hasInAppHistory } from "../smart-back";

// UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: live-confirmed the exact two states this function
// must distinguish -- a fresh full-page load produced window.history.state = { idx: 0 } (no real
// "back" target in this browsing session), while one client-side navigation produced
// { idx: 1, key: "e25roky2", usr: null } (a real prior page exists to go back to).
describe("hasInAppHistory", () => {
  it("is false on a direct URL load/refresh (idx 0)", () => {
    expect(hasInAppHistory({ idx: 0 })).toBe(false);
  });

  it("is true once the user has navigated within the app (idx > 0)", () => {
    expect(hasInAppHistory({ idx: 1, key: "e25roky2", usr: null })).toBe(true);
    expect(hasInAppHistory({ idx: 5 })).toBe(true);
  });

  it("is false for null/undefined/missing history state", () => {
    expect(hasInAppHistory(null)).toBe(false);
    expect(hasInAppHistory(undefined)).toBe(false);
    expect(hasInAppHistory({})).toBe(false);
  });

  it("is false for a non-numeric idx (defensive)", () => {
    expect(hasInAppHistory({ idx: "1" })).toBe(false);
    expect(hasInAppHistory({ idx: null })).toBe(false);
  });
});
