import { describe, expect, it } from "vitest";
import {
  formatPlannerDwell,
  isPlannerWeekend,
  plannerMonthBands,
  plannerWeekdayShort,
} from "./plannerTimeAxis";

describe("plannerTimeAxis", () => {
  it("marks Sat/Sun as weekend (UTC calendar)", () => {
    expect(isPlannerWeekend("2026-06-20")).toBe(true); // Sat
    expect(isPlannerWeekend("2026-06-21")).toBe(true); // Sun
    expect(isPlannerWeekend("2026-06-22")).toBe(false); // Mon
  });

  it("splits month bands with colSpans", () => {
    const bands = plannerMonthBands(["2026-06-29", "2026-06-30", "2026-07-01"]);
    expect(bands).toHaveLength(2);
    expect(bands[0].span).toBe(2);
    expect(bands[0].label).toMatch(/Jun/);
    expect(bands[1].span).toBe(1);
    expect(bands[1].label).toMatch(/Jul/);
  });

  it("uses two-letter weekday", () => {
    expect(plannerWeekdayShort("2026-06-22")).toBe("Mo");
  });

  it("formats dwell duration", () => {
    expect(formatPlannerDwell("2026-06-22T08:00:00Z", "2026-06-24T12:00:00Z")).toBe("2d 4h");
  });
});
