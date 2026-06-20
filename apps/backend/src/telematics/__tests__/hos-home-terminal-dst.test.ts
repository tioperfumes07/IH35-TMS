import { describe, expect, it } from "vitest";
import { homeDayWindowUtc } from "../hos-tracker.service.js";

// HOS law: day boundaries anchor to the home terminal (America/Chicago) and are DST-aware. A Central calendar day is
// 23h on spring-forward and 25h on fall-back — fixed 24h day math (the old code) would mis-bucket on-duty and the
// 1440 sanity cap would falsely flag a real 25h day. Luxon startOf("day")/plus({days:1}) gets it right.
const minutesBetween = (w: { start: Date; end: Date }) => Math.round((w.end.getTime() - w.start.getTime()) / 60000);

describe("homeDayWindowUtc — DST-aware home-terminal calendar days", () => {
  it("a normal Central day is 24h (1440 min)", () => {
    expect(minutesBetween(homeDayWindowUtc("2026-06-19"))).toBe(1440);
  });

  it("spring-forward (2026-03-08) is a 23h (1380 min) day", () => {
    expect(minutesBetween(homeDayWindowUtc("2026-03-08"))).toBe(1380);
  });

  it("fall-back (2026-11-01) is a 25h (1500 min) day", () => {
    expect(minutesBetween(homeDayWindowUtc("2026-11-01"))).toBe(1500);
  });

  it("day start is the Central midnight in UTC (DST-correct offset, not a fixed -6/-5)", () => {
    // 2026-06-19 is CDT (UTC-5): Central midnight = 05:00Z. 2026-01-15 is CST (UTC-6): Central midnight = 06:00Z.
    expect(homeDayWindowUtc("2026-06-19").start.toISOString()).toBe("2026-06-19T05:00:00.000Z");
    expect(homeDayWindowUtc("2026-01-15").start.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });
});
