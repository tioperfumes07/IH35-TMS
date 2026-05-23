import { describe, expect, it } from "vitest";
import { computeRetryDelayMs } from "../../../qbo/sync-state-machine.js";

describe("qbo-sync-worker backoff", () => {
  it("uses exponential minutes scaled to milliseconds", () => {
    expect(computeRetryDelayMs(1)).toBe(2 ** 1 * 60_000);
    expect(computeRetryDelayMs(2)).toBe(2 ** 2 * 60_000);
    expect(computeRetryDelayMs(3)).toBe(2 ** 3 * 60_000);
  });

  it("clamps the exponent into a safe window", () => {
    expect(computeRetryDelayMs(0)).toBe(2 ** 1 * 60_000);
    expect(computeRetryDelayMs(99)).toBe(60 * 60_000);
  });
});
