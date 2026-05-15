import { describe, expect, it } from "vitest";
import { computeOutboundBackoffMs } from "./sync-backoff.js";

describe("computeOutboundBackoffMs", () => {
  it("uses 30s base with doubling capped at 1h", () => {
    expect(computeOutboundBackoffMs(1)).toBe(30_000);
    expect(computeOutboundBackoffMs(2)).toBe(60_000);
    expect(computeOutboundBackoffMs(3)).toBe(120_000);
    expect(computeOutboundBackoffMs(99)).toBe(3_600_000);
  });
});
