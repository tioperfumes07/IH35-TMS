import { describe, expect, it } from "vitest";
import { computeSyncRunBackoffMs } from "../qbo-sync-worker.js";

describe("qbo-sync-worker backoff", () => {
  it("uses exponential minutes scaled to milliseconds", () => {
    expect(computeSyncRunBackoffMs(1)).toBe(2 ** 1 * 60_000);
    expect(computeSyncRunBackoffMs(2)).toBe(2 ** 2 * 60_000);
    expect(computeSyncRunBackoffMs(3)).toBe(2 ** 3 * 60_000);
  });

  it("clamps the exponent into a safe window", () => {
    expect(computeSyncRunBackoffMs(0)).toBe(2 ** 1 * 60_000);
    expect(computeSyncRunBackoffMs(99)).toBe(2 ** 16 * 60_000);
  });
});
