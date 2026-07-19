import { describe, expect, it } from "vitest";
import {
  clampRetryAfterMs,
  FMCSA_RETRY_AFTER_MAX_MS,
  FMCSA_RETRY_AFTER_MIN_MS,
  FmcsaRetryableError,
  mergeFmcsaRetryableCooldown,
  parseRetryAfterMs,
} from "../fmcsa-http-errors.js";

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds and clamps to bounds", () => {
    expect(parseRetryAfterMs("0")).toBe(FMCSA_RETRY_AFTER_MIN_MS);
    expect(parseRetryAfterMs("30")).toBe(30_000);
    expect(parseRetryAfterMs("999999")).toBe(FMCSA_RETRY_AFTER_MAX_MS);
  });

  it("returns null for missing/empty/invalid (never invents a delay)", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("not-a-date")).toBeNull();
  });

  it("parses HTTP-date Retry-After relative to now", () => {
    const now = Date.parse("2026-07-19T00:00:00.000Z");
    const header = new Date(now + 45_000).toUTCString();
    expect(parseRetryAfterMs(header, now)).toBe(45_000);
  });

  it("clampRetryAfterMs never returns below min", () => {
    expect(clampRetryAfterMs(-5)).toBe(FMCSA_RETRY_AFTER_MIN_MS);
  });
});

describe("mergeFmcsaRetryableCooldown", () => {
  it("keeps preferred status/message and max Retry-After when preferred is smaller", () => {
    const safer = new FmcsaRetryableError("FMCSA safer rate limited (429)", {
      status: 429,
      retryAfterMs: 12_000,
    });
    const mobile = new FmcsaRetryableError("FMCSA mobile rate limited (429)", {
      status: 429,
      retryAfterMs: 90_000,
    });
    const merged = mergeFmcsaRetryableCooldown(safer, mobile);
    expect(merged.message).toBe(safer.message);
    expect(merged.status).toBe(429);
    expect(merged.retryAfterMs).toBe(90_000);
  });

  it("keeps preferred when preferred Retry-After is already larger", () => {
    const safer = new FmcsaRetryableError("FMCSA safer rate limited (429)", {
      status: 429,
      retryAfterMs: 120_000,
    });
    const mobile = new FmcsaRetryableError("FMCSA mobile rate limited (429)", {
      status: 429,
      retryAfterMs: 15_000,
    });
    const merged = mergeFmcsaRetryableCooldown(safer, mobile);
    expect(merged).toBe(safer);
    expect(merged.retryAfterMs).toBe(120_000);
  });
});
