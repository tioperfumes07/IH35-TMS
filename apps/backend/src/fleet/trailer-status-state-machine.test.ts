import { describe, expect, it } from "vitest";
import {
  TRAILER_STATUS_TRANSITIONS,
  TRAILER_STATUS_VALUES,
  validateTrailerStatusTransition,
} from "./trailer-status-state-machine.js";

describe("trailer status state machine", () => {
  it("accepts happy-path transitions from InService", () => {
    expect(validateTrailerStatusTransition("InService", "OutOfService")).toBeNull();
    expect(validateTrailerStatusTransition("InService", "Sold")).toBeNull();
  });

  it("rejects illegal transitions such as Sold to InService without override", () => {
    const err = validateTrailerStatusTransition("Sold", "InService");
    expect(err?.error).toBe("illegal_trailer_status_transition");
    expect(err?.current_status).toBe("Sold");
    expect(err?.requested_status).toBe("InService");
    expect(err?.reason).toContain("SOLD_to_ACTIVE");
  });

  it("covers every equipment status enum value with explicit transition rules", () => {
    for (const status of TRAILER_STATUS_VALUES) {
      expect(TRAILER_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});
