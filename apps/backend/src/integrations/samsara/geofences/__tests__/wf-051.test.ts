import { describe, expect, it } from "vitest";
import { WF_051_ARRIVAL_RADIUS_METERS, WF_051_LEGACY_RADIUS_METERS } from "../wf-051-radius.js";
import { isWithinArrivalRadius, shouldTriggerArrivalPrompt } from "../arrival-prompt.service.js";

describe("WF-051 radius constant", () => {
  it("locks 250-foot radius at 76.2 meters", () => {
    expect(WF_051_ARRIVAL_RADIUS_METERS).toBe(76.2);
    expect(WF_051_LEGACY_RADIUS_METERS).toBe(40233.6);
  });
});

describe("arrival prompt trigger distance", () => {
  const stopLat = 27.5306;
  const stopLng = -99.4803;

  it("does not trigger at 1000m away", () => {
    const farLat = stopLat + 0.009;
    expect(isWithinArrivalRadius(farLat, stopLng, stopLat, stopLng)).toBe(false);
    expect(shouldTriggerArrivalPrompt(farLat, stopLng, stopLat, stopLng).trigger).toBe(false);
  });

  it("does not trigger at 10000m away", () => {
    const farLat = stopLat + 0.09;
    expect(shouldTriggerArrivalPrompt(farLat, stopLng, stopLat, stopLng).trigger).toBe(false);
  });

  it("triggers within 76.2m", () => {
    const nearLat = stopLat + 0.0002;
    const result = shouldTriggerArrivalPrompt(nearLat, stopLng, stopLat, stopLng);
    expect(result.distance_meters).toBeLessThanOrEqual(76.2);
    expect(result.trigger).toBe(true);
  });
});
