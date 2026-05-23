import { describe, expect, it } from "vitest";
import { shouldTriggerArrival } from "../arrival-detection.service.js";

describe("arrival dedupe window", () => {
  it("blocks re-trigger within 30 minutes", () => {
    const occurredAt = "2026-05-23T20:20:00.000Z";
    const lastTriggered = "2026-05-23T20:00:00.000Z";
    expect(shouldTriggerArrival(120, lastTriggered, occurredAt)).toBe(false);
  });

  it("allows re-trigger after 30 minutes", () => {
    const occurredAt = "2026-05-23T20:31:00.000Z";
    const lastTriggered = "2026-05-23T20:00:00.000Z";
    expect(shouldTriggerArrival(120, lastTriggered, occurredAt)).toBe(true);
  });
});
