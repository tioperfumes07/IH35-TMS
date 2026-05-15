import { describe, expect, it } from "vitest";
import { computeOutboundBackoffMs } from "./sync-backoff.js";

describe("computeOutboundBackoffMs", () => {
  it("increases exponentially and caps", () => {
    expect(computeOutboundBackoffMs(1)).toBe(5_000);
    expect(computeOutboundBackoffMs(2)).toBe(10_000);
    expect(computeOutboundBackoffMs(3)).toBe(20_000);
    expect(computeOutboundBackoffMs(12)).toBe(60 * 60 * 1000);
    expect(computeOutboundBackoffMs(99)).toBe(60 * 60 * 1000);
  });

  it("treats non-positive attempt as first backoff", () => {
    expect(computeOutboundBackoffMs(0)).toBe(5_000);
    expect(computeOutboundBackoffMs(-3)).toBe(5_000);
  });
});
