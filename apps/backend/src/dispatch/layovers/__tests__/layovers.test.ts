import { describe, it, expect } from "vitest";
import { LAYOVER_THRESHOLD_HOURS } from "../detection.service.js";

describe("layover detection", () => {
  it("threshold is 8 hours", () => {
    expect(LAYOVER_THRESHOLD_HOURS).toBe(8);
  });

  it("gap below threshold is not a layover", () => {
    const gapHours = 7;
    expect(gapHours > LAYOVER_THRESHOLD_HOURS).toBe(false);
  });

  it("gap above threshold is a layover", () => {
    const gapHours = 10;
    expect(gapHours > LAYOVER_THRESHOLD_HOURS).toBe(true);
  });
});
