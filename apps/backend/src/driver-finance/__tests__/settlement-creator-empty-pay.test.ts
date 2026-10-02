import { describe, expect, it } from "vitest";
import { creatorEmptyPayCents, creatorEmptyRateCents } from "../settlement-creator-empty-pay.js";

describe("queue item 7 (G-10) — Settlement Creator empty-mile pay", () => {
  it("uses the typed empty rate when there is one", () => {
    expect(creatorEmptyRateCents({ empty_rate_cents: 40, line_haul_rate_cents: 45 })).toBe(40);
    expect(creatorEmptyPayCents({ empty_miles: 100, empty_rate_cents: 40, line_haul_rate_cents: 45 })).toBe(4_000);
  });

  it("no empty rate (or 0) pays empty miles at the loaded per-mile rate — never $0.00 on real empty miles", () => {
    expect(creatorEmptyPayCents({ empty_miles: 212.4, empty_rate_cents: null, line_haul_rate_cents: 45 })).toBe(9_558);
    expect(creatorEmptyPayCents({ empty_miles: 212.4, empty_rate_cents: 0, line_haul_rate_cents: 45 })).toBe(9_558);
  });

  it("no per-mile rate anywhere stays unpriced; no empty miles pays nothing", () => {
    expect(creatorEmptyRateCents({ empty_rate_cents: null, line_haul_rate_cents: null })).toBeNull();
    expect(creatorEmptyPayCents({ empty_miles: 50, empty_rate_cents: null, line_haul_rate_cents: null })).toBe(0);
    expect(creatorEmptyPayCents({ empty_miles: 0, empty_rate_cents: 45 })).toBe(0);
  });
});
