import { describe, expect, it } from "vitest";
import { combineQueryIsError } from "../combineQueryIsError";

// GO-0040-HOME-QBO-SYNC-HEALTH-SUB-PANEL-SILENT-FAILURE: QboSyncHealthCard on both OwnerHome.tsx
// and DefaultHome.tsx is driven by 4 independent queries but was wired to only the FIRST query's
// isError -- a failure in any of the other 3 silently dropped that section with no error
// affordance. This helper is the fix: it must report true the moment ANY query in the set fails,
// regardless of position, so the card's whole-card error state (with Retry) always fires instead
// of the sub-panel silently vanishing.
describe("combineQueryIsError", () => {
  it("is false when every query succeeded", () => {
    expect(combineQueryIsError([{ isError: false }, { isError: false }, { isError: false }])).toBe(false);
  });

  it("is true when the FIRST query failed (the only case the old wiring caught)", () => {
    expect(combineQueryIsError([{ isError: true }, { isError: false }, { isError: false }])).toBe(true);
  });

  it("is true when a LATER query failed (the exact regression this fix closes)", () => {
    expect(combineQueryIsError([{ isError: false }, { isError: false }, { isError: true }])).toBe(true);
  });

  it("is true when the LAST of four queries failed (matches the real 4-query card shape)", () => {
    expect(
      combineQueryIsError([{ isError: false }, { isError: false }, { isError: false }, { isError: true }]),
    ).toBe(true);
  });

  it("is false for an empty query set", () => {
    expect(combineQueryIsError([])).toBe(false);
  });
});
