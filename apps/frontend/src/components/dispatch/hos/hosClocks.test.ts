import { describe, expect, it } from "vitest";
import { mergeEldWithInAppFallback, resolveDisplayHosClocks } from "./hosClocks";

describe("resolveDisplayHosClocks — partial certified ELD", () => {
  it("fills null certified cycle from in-app cycle_remaining_min on the same API row", () => {
    const row = {
      driver_id: "d-1",
      drive_remaining_min: 600,
      window_remaining_min: 800,
      break_remaining_min: 480,
      cycle_remaining_min: 4200,
      last_reset_at: null,
      status: "ok" as const,
      eld_certified: {
        drive_remaining_min: 359,
        shift_remaining_min: 465,
        cycle_remaining_min: null,
        break_remaining_min: 480,
        violation: false,
        polled_at: "2026-09-01T12:00:00Z",
      },
    };
    const { clocks, mergedInAppFields } = resolveDisplayHosClocks(row);
    expect(clocks?.cycle).toBe("70:00");
    expect(clocks?.drive).toBe("5:59");
    expect(mergedInAppFields).toBe(true);
  });

  it("returns null clocks when neither certified nor in-app have headline values", () => {
    expect(
      mergeEldWithInAppFallback(
        { drive_remaining_min: null, shift_remaining_min: null, cycle_remaining_min: null, break_remaining_min: null, violation: false, polled_at: "" },
        null
      )
    ).toBeNull();
  });
});
