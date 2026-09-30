import { describe, expect, it } from "vitest";
import {
  formatMilesRemainingHonest,
  formatNoOdometerReading,
  formatOdometerCellHonest,
} from "./odometerHonesty";

describe("odometerHonesty (C-21)", () => {
  it("names the last reading date when odometer is missing", () => {
    expect(formatNoOdometerReading("2026-09-10T12:00:00Z")).toMatch(/No odometer reading since/);
    expect(formatNoOdometerReading(null)).toBe("No odometer reading on file");
  });

  it("does not invent miles left when current odometer is null", () => {
    expect(
      formatMilesRemainingHonest({
        milesRemaining: 0,
        currentOdometerMi: null,
        odometerReadingAt: "2026-09-10",
      }),
    ).toMatch(/No odometer reading since/);
  });

  it("formats a real odometer cell", () => {
    expect(formatOdometerCellHonest({ odometerMi: 123456 })).toBe("123,456 mi");
    expect(formatOdometerCellHonest({ odometerMi: null, odometerReadingAt: null })).toBe(
      "No odometer reading on file",
    );
  });
});
