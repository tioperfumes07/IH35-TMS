import { describe, expect, it } from "vitest";
import { dayWindows } from "./relay-fuel-ingest.cron.js";

// Owner directive 2026-07-15: pull Relay fuel history in small (default 3-day) windows so a busy carrier's
// volume can't exceed the request timeout in one call. Windows must be inclusive, contiguous, oldest→newest,
// with NO gaps and NO overlaps.
describe("dayWindows", () => {
  it("splits a range into contiguous 3-day windows, oldest→newest, no gaps/overlaps", () => {
    const w = dayWindows("2026-03-01", "2026-03-10", 3);
    expect(w).toEqual([
      { startDate: "2026-03-01", endDate: "2026-03-03" },
      { startDate: "2026-03-04", endDate: "2026-03-06" },
      { startDate: "2026-03-07", endDate: "2026-03-09" },
      { startDate: "2026-03-10", endDate: "2026-03-10" }, // final partial window clamps to end
    ]);
    // contiguity: each window's start is exactly the day after the previous window's end
    for (let i = 1; i < w.length; i++) {
      const prevEnd = new Date(`${w[i - 1].endDate}T00:00:00Z`);
      const thisStart = new Date(`${w[i].startDate}T00:00:00Z`);
      expect(thisStart.getTime() - prevEnd.getTime()).toBe(24 * 3600 * 1000);
    }
  });

  it("honors a custom window size", () => {
    expect(dayWindows("2026-01-01", "2026-01-07", 7)).toEqual([{ startDate: "2026-01-01", endDate: "2026-01-07" }]);
    expect(dayWindows("2026-01-01", "2026-01-02", 1)).toEqual([
      { startDate: "2026-01-01", endDate: "2026-01-01" },
      { startDate: "2026-01-02", endDate: "2026-01-02" },
    ]);
  });

  it("returns a single window for a one-day range (the daily-cron shape)", () => {
    expect(dayWindows("2026-07-14", "2026-07-14", 3)).toEqual([{ startDate: "2026-07-14", endDate: "2026-07-14" }]);
  });

  it("returns no windows for an inverted range (guards against an infinite loop)", () => {
    expect(dayWindows("2026-03-10", "2026-03-01", 3)).toEqual([]);
  });

  it("covers a long span without gaps (spot-check month boundary)", () => {
    const w = dayWindows("2026-01-30", "2026-02-04", 3);
    expect(w).toEqual([
      { startDate: "2026-01-30", endDate: "2026-02-01" },
      { startDate: "2026-02-02", endDate: "2026-02-04" },
    ]);
  });
});
