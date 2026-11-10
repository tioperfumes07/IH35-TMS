import { describe, expect, it } from "vitest";
import { fuelBoardPeriodOptions, fuelBoardPeriodRange } from "./fuelBoardPeriod";

describe("Fuel board calendar captions", () => {
  it.each([
    ["2026-10-09T18:00:00Z", "Oct", "Sep"],
    ["2026-11-09T18:00:00Z", "Nov", "Oct"],
    ["2027-01-09T18:00:00Z", "Jan", "Dec"],
    ["2026-12-01T01:30:00Z", "Nov", "Oct"],
  ])("labels current and previous business months at %s", (instant, current, previous) => {
    expect(fuelBoardPeriodOptions(new Date(instant))).toEqual([
      { id: "oct", label: current }, { id: "sep", label: previous }, { id: "ytd", label: "YTD" },
    ]);
  });
  it("names both months in a year-to-date range", () => {
    expect(fuelBoardPeriodRange("ytd", new Date("2026-11-09T18:00:00Z"))).toEqual({
      from: "2026-01-01", to: "2026-11-09", labelSuffix: "Jan 1 – Nov 9",
    });
  });

  it("uses the Central business month before UTC midnight rollover", () => {
    expect(fuelBoardPeriodRange("oct", new Date("2026-12-01T01:30:00Z"))).toEqual({
      from: "2026-11-01", to: "2026-11-30", labelSuffix: "Nov 1–30",
    });
  });

  it("keeps previous-month boundaries across the year rollover", () => {
    expect(fuelBoardPeriodRange("sep", new Date("2027-01-09T18:00:00Z"))).toEqual({
      from: "2026-12-01", to: "2026-12-31", labelSuffix: "Dec 1–31",
    });
  });
});
