import { describe, expect, it } from "vitest";
import { classifyRateconExtractError } from "../ratecon-extract.routes.js";
import { RateConTooLargeError } from "../ratecon-extract.service.js";
import {
  AnthropicNotConfiguredError,
  AnthropicRateLimitError,
  AnthropicTimeoutError,
} from "../../ai/anthropic-messages.js";

// RATECON-3 — the core regression this fix prevents: a retired model returns anthropic_http_404 from the
// shared client; it must surface as 502 extraction_failed AND be captured — never a silent 500.
describe("classifyRateconExtractError", () => {
  it("anthropic_http_404 (retired/unknown model) → 502 extraction_failed, CAPTURED (not a silent 500)", () => {
    const c = classifyRateconExtractError(new Error("anthropic_http_404:{\"type\":\"not_found_error\"}"));
    expect(c.status).toBe(502);
    expect(c.body).toMatchObject({ error: "extraction_failed" });
    expect(String(c.body.detail)).toContain("anthropic_http_404");
    expect(c.capture).toBe(true);
  });

  it("AnthropicTimeoutError → 502 extraction_failed, captured", () => {
    const c = classifyRateconExtractError(new AnthropicTimeoutError());
    expect(c.status).toBe(502);
    expect(c.body).toMatchObject({ error: "extraction_failed" });
    expect(c.capture).toBe(true);
  });

  it("AnthropicRateLimitError → 502 extraction_failed, captured", () => {
    const c = classifyRateconExtractError(new AnthropicRateLimitError());
    expect(c.status).toBe(502);
    expect(c.capture).toBe(true);
  });

  it("AnthropicNotConfiguredError → 503 ai_not_configured, captured (5xx)", () => {
    const c = classifyRateconExtractError(new AnthropicNotConfiguredError());
    expect(c.status).toBe(503);
    expect(c.body).toMatchObject({ error: "ai_not_configured" });
    expect(c.capture).toBe(true);
  });

  it("anthropic_parse_error → 502 extraction_failed", () => {
    expect(classifyRateconExtractError(new Error("anthropic_parse_error: empty_content")).status).toBe(502);
  });

  it("RateConTooLargeError → 413, NOT captured (client error)", () => {
    const c = classifyRateconExtractError(new RateConTooLargeError("bytes", "too big"));
    expect(c.status).toBe(413);
    expect(c.body).toMatchObject({ error: "ratecon_too_large", reason: "bytes" });
    expect(c.capture).toBe(false);
  });

  it("unknown error → 500 internal_error, captured", () => {
    const c = classifyRateconExtractError(new Error("something unexpected"));
    expect(c.status).toBe(500);
    expect(c.body).toMatchObject({ error: "internal_error" });
    expect(c.capture).toBe(true);
  });

  it("missing canonical extraction row → 503 persistence failure, captured", () => {
    const c = classifyRateconExtractError(new Error("ratecon_extraction_create_failed"));
    expect(c).toEqual({
      status: 503,
      body: { error: "extraction_persistence_failed" },
      capture: true,
      phase: "persistence_failed",
    });
  });
});
