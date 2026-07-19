import { describe, expect, it } from "vitest";
import { computeOutboxRetryDelayMs, OUTBOX_RETRY_BACKOFF_MS } from "../retry-backoff.js";

describe("outbox retry backoff + jitter", () => {
  it("stays within equal-jitter bounds for each attempt", () => {
    for (let attempt = 1; attempt <= OUTBOX_RETRY_BACKOFF_MS.length + 2; attempt++) {
      const idx = Math.min(attempt - 1, OUTBOX_RETRY_BACKOFF_MS.length - 1);
      const base = OUTBOX_RETRY_BACKOFF_MS[idx]!;
      const half = Math.floor(base / 2);
      const low = computeOutboxRetryDelayMs(attempt, () => 0);
      const high = computeOutboxRetryDelayMs(attempt, () => 0.999999);
      expect(low).toBeGreaterThanOrEqual(1_000);
      expect(low).toBeGreaterThanOrEqual(half);
      expect(high).toBeLessThanOrEqual(base);
      expect(high).toBeGreaterThanOrEqual(half);
    }
  });

  it("is bounded (does not grow past the last backoff slot)", () => {
    const last = OUTBOX_RETRY_BACKOFF_MS[OUTBOX_RETRY_BACKOFF_MS.length - 1]!;
    const delay = computeOutboxRetryDelayMs(99, () => 0.999999);
    expect(delay).toBeLessThanOrEqual(last);
    expect(computeOutboxRetryDelayMs(99, () => 1)).toBeLessThanOrEqual(last);
  });
});
