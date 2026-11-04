import { describe, expect, it } from "vitest";
import { fuelGapReason } from "./fuel-source-state.js";

describe("row 163 fuel source state", () => {
  it("names the never-synced Loves feed and the missing recommendations", () => {
    const r = fuelGapReason({ sourceMissing: true, lovesRows: 0, lovesLastSyncedAt: null, feedConfigured: false })!;
    expect(r).toMatch(/never synced/);
    expect(r).toMatch(/LOVES_CARD_CSV_URL/);
    expect(r).toMatch(/no recommendation/);
  });
  it("says a configured feed has delivered nothing", () => {
    expect(fuelGapReason({ sourceMissing: false, lovesRows: 0, lovesLastSyncedAt: null, feedConfigured: true })).toMatch(/configured but has delivered no row/);
  });
  it("is silent when prices are synced and the source exists", () => {
    expect(fuelGapReason({ sourceMissing: false, lovesRows: 40, lovesLastSyncedAt: "2026-11-01T06:00:00Z", feedConfigured: true })).toBeNull();
  });
  it("states the last sync date when only the planner is missing", () => {
    expect(fuelGapReason({ sourceMissing: true, lovesRows: 40, lovesLastSyncedAt: "2026-11-01T06:00:00Z", feedConfigured: true })).toMatch(/last synced 2026-11-01/);
  });
});
