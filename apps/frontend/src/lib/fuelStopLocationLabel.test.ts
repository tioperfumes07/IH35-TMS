import { describe, expect, it } from "vitest";
import {
  formatFuelStopLocationLabel,
  formatFuelStopLocationSublabel,
} from "./fuelStopLocationLabel";

describe("formatFuelStopLocationLabel", () => {
  it("prefers street address when present (AlwaysTrack card-terminal shape)", () => {
    expect(
      formatFuelStopLocationLabel({
        name: "Love's #471 — Natalia, TX",
        address: "101 PINNACLE ROAD",
        city: "Laredo",
        state: "TX",
        location_code: "LOVES-471",
      }),
    ).toBe("101 PINNACLE ROAD · Laredo, TX");
  });

  it("falls back to Love's catalog name when address is null (604 seed shape)", () => {
    expect(
      formatFuelStopLocationLabel({
        name: "Love's #206 — Loxley, AL",
        address: null,
        city: "Loxley",
        state: "AL",
        location_code: "LOVES-206",
      }),
    ).toBe("Love's #206 — Loxley, AL");
  });
});

describe("formatFuelStopLocationSublabel", () => {
  it("shows code only when name already carries city/state", () => {
    expect(
      formatFuelStopLocationSublabel({
        location_code: "LOVES-206",
        city: "Loxley",
        state: "AL",
        address: null,
      }),
    ).toBe("LOVES-206");
  });

  it("appends city/state under a street primary label", () => {
    expect(
      formatFuelStopLocationSublabel({
        location_code: "LOVES-604",
        city: "Laredo",
        state: "TX",
        address: "101 PINNACLE ROAD",
      }),
    ).toBe("LOVES-604 · Laredo, TX");
  });
});
