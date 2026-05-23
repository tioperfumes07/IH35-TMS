import { describe, expect, it } from "vitest";
import { suggestStatusTransition } from "../auto-status.service.js";

describe("auto status transition rules", () => {
  it("suggests in_transit when moving from assigned/dispatched", () => {
    const out = suggestStatusTransition({
      current_status: "assigned",
      engine_on: true,
      speed_mph: 20,
      geofence_event_kind: null,
      geofence_idle_minutes: 0,
      next_stop_type: "pickup",
    });
    expect(out?.suggested_to).toBe("in_transit");
  });

  it("suggests at_delivery when idling in geofence at delivery stop", () => {
    const out = suggestStatusTransition({
      current_status: "in_transit",
      engine_on: true,
      speed_mph: 0,
      geofence_event_kind: "entered",
      geofence_idle_minutes: 6,
      next_stop_type: "delivery",
    });
    expect(out?.suggested_to).toBe("at_delivery");
  });
});
