import { describe, expect, it } from "vitest";
import { shouldShowArrivalPrompt, WF_051_ARRIVAL_RADIUS_METERS } from "../arrival-prompt-trigger.js";

describe("driver PWA arrival prompt", () => {
  const stopLat = 27.5306;
  const stopLng = -99.4803;

  it("uses 76.2m constant", () => {
    expect(WF_051_ARRIVAL_RADIUS_METERS).toBe(76.2);
  });

  it("shows prompt only within 250 feet", () => {
    expect(shouldShowArrivalPrompt(stopLat + 0.09, stopLng, stopLat, stopLng)).toBe(false);
    expect(shouldShowArrivalPrompt(stopLat + 0.0002, stopLng, stopLat, stopLng)).toBe(true);
  });
});
