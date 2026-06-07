import { describe, expect, it } from "vitest";
import { deriveOnTimePrediction } from "../dispatch-live-eta.service.js";

describe("deriveOnTimePrediction", () => {
  it("returns green when ETA is within 15 minutes of scheduled delivery", () => {
    expect(deriveOnTimePrediction("2026-06-07T18:10:00.000Z", "2026-06-07T18:00:00.000Z")).toBe("green");
  });

  it("returns amber when ETA is moderately late", () => {
    expect(deriveOnTimePrediction("2026-06-07T18:45:00.000Z", "2026-06-07T18:00:00.000Z")).toBe("amber");
  });

  it("returns red when ETA is more than 60 minutes late", () => {
    expect(deriveOnTimePrediction("2026-06-07T19:30:00.000Z", "2026-06-07T18:00:00.000Z")).toBe("red");
  });
});
