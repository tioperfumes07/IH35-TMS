import { describe, expect, it } from "vitest";
import {
  buildBorderCrossingStop,
  isCrossBorderTripType,
  withBorderCrossingStop,
} from "./borderCrossingStop";

// Mirrors LoadDetailDrawer.loadHasCrossBorder so the test proves the built stop actually flips the
// Customs tab on — without importing the drawer (loadHasCrossBorder is a private function there).
function loadHasCrossBorder(stops: Array<{ stop_type?: string; country?: string | null }>): boolean {
  return stops.some(
    (s) =>
      s.stop_type === "border" ||
      Boolean(s.country && !["US", "USA", "United States"].includes(String(s.country)))
  );
}

describe("isCrossBorderTripType", () => {
  it("is true for NB and SB, false for TR/empty", () => {
    expect(isCrossBorderTripType("NB")).toBe(true);
    expect(isCrossBorderTripType("SB")).toBe(true);
    expect(isCrossBorderTripType("sb")).toBe(true);
    expect(isCrossBorderTripType("TR")).toBe(false);
    expect(isCrossBorderTripType("")).toBe(false);
    expect(isCrossBorderTripType(null)).toBe(false);
    expect(isCrossBorderTripType(undefined)).toBe(false);
  });
});

describe("buildBorderCrossingStop", () => {
  it("builds a stop_type='border' stop carrying the port name and side", () => {
    const stop = buildBorderCrossingStop({
      id: "poe-1",
      name: "Laredo World Trade Bridge",
      short_name: "Laredo WTB",
      country: "US",
      cbp_port_code: "2304",
    });
    expect(stop.stop_type).toBe("border");
    expect(stop.city).toBe("Laredo WTB");
    expect(stop.country).toBe("US");
    expect(stop.stop_notes).toContain("Laredo World Trade Bridge");
    expect(stop.stop_notes).toContain("2304");
  });

  it("falls back to full name when short_name is blank", () => {
    const stop = buildBorderCrossingStop({ id: "poe-2", name: "Pharr International Bridge", short_name: "", country: "US" });
    expect(stop.city).toBe("Pharr International Bridge");
  });
});

describe("withBorderCrossingStop", () => {
  const border = { stop_type: "border" as const, city: "Laredo WTB", country: "US" };

  it("inserts the border stop immediately before the first delivery", () => {
    const stops = [
      { stop_type: "pickup", city: "Indianapolis" },
      { stop_type: "delivery", city: "Laredo" },
    ];
    const out = withBorderCrossingStop(stops as Array<{ stop_type: string }>, border);
    expect(out.map((s) => s.stop_type)).toEqual(["pickup", "border", "delivery"]);
  });

  it("appends when there is no delivery", () => {
    const stops = [{ stop_type: "pickup", city: "A" }];
    const out = withBorderCrossingStop(stops as Array<{ stop_type: string }>, border);
    expect(out.map((s) => s.stop_type)).toEqual(["pickup", "border"]);
  });

  it("produces a stop set that loadHasCrossBorder recognizes (tab appears on its own)", () => {
    const usOnly = [
      { stop_type: "pickup", country: "USA" },
      { stop_type: "delivery", country: "US" },
    ];
    expect(loadHasCrossBorder(usOnly)).toBe(false);
    const withBorder = withBorderCrossingStop(usOnly as Array<{ stop_type: string; country?: string }>, border);
    expect(loadHasCrossBorder(withBorder)).toBe(true);
  });
});
