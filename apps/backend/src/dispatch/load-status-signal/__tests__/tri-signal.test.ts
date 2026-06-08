import { describe, expect, it } from "vitest";
import { TRI_SIGNAL_THRESHOLDS } from "../thresholds.config.js";
import { evaluateTriSignal, type TriSignalInputs } from "../tri-signal.service.js";

const BASE: TriSignalInputs = {
  load_uuid: "00000000-0000-4000-8000-000000000001",
  status: "in_transit",
  scheduled_delivery_at: "2026-06-08T18:00:00.000Z",
  gps_eta_at: "2026-06-08T18:30:00.000Z",
  hos_remaining_minutes: 300,
  driver_ack_age_minutes: 15,
  speed_mph: 55,
  minutes_since_last_position: 5,
};

describe("TRI_SIGNAL_THRESHOLDS", () => {
  it("matches CAP-5 locked config", () => {
    expect(TRI_SIGNAL_THRESHOLDS).toEqual({
      onTrackMaxSlipMinutes: 60,
      behindMinSlipMinutes: 60,
      behindMaxSlipMinutes: 180,
      delayedMinSlipMinutes: 180,
      delayedOnHosDepleted: true,
      delayedOnNoMovementMinutes: 60,
    });
  });
});

describe("evaluateTriSignal", () => {
  it("returns on_track when slip is within 60 minutes", () => {
    const out = evaluateTriSignal(BASE);
    expect(out.signal).toBe("on_track");
    expect(out.slip_minutes).toBe(30);
  });

  it("returns behind when slip is between 61 and 180 minutes", () => {
    const out = evaluateTriSignal({
      ...BASE,
      gps_eta_at: "2026-06-08T19:30:00.000Z",
    });
    expect(out.signal).toBe("behind");
    expect(out.slip_minutes).toBe(90);
  });

  it("returns delayed when slip exceeds 180 minutes", () => {
    const out = evaluateTriSignal({
      ...BASE,
      gps_eta_at: "2026-06-08T22:00:00.000Z",
    });
    expect(out.signal).toBe("delayed");
    expect(out.slip_minutes).toBe(240);
  });

  it("short-circuits to delayed when HOS drive time is zero", () => {
    const out = evaluateTriSignal({
      ...BASE,
      hos_remaining_minutes: 0,
    });
    expect(out.signal).toBe("delayed");
    expect(out.reason).toContain("HOS depleted");
  });

  it("returns delayed when stationary beyond movement threshold", () => {
    const out = evaluateTriSignal({
      ...BASE,
      speed_mph: 0,
      minutes_since_last_position: 75,
    });
    expect(out.signal).toBe("delayed");
    expect(out.reason).toContain("No movement");
  });

  it("returns on_track with no GPS ETA edge case", () => {
    const out = evaluateTriSignal({
      ...BASE,
      gps_eta_at: null,
    });
    expect(out.signal).toBe("on_track");
    expect(out.slip_minutes).toBeNull();
    expect(out.reason).toContain("No GPS ETA");
  });
});
