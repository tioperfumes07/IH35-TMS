import { describe, expect, it } from "vitest";
import { classifyFmcsaLookupFailure, isRetryableFmcsaError, RetryableFmcsaError } from "../errors.js";

describe("FMCSA error taxonomy", () => {
  it("classifies timeouts and 5xx as retryable", () => {
    expect(classifyFmcsaLookupFailure(new Error("FMCSA timeout"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("FMCSA mobile service error 503"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("FMCSA SAFER service error 502"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("fetch failed"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("429 Too Many Requests"))).toBe("retryable");
  });

  it("classifies unknown permanent failures as permanent", () => {
    expect(classifyFmcsaLookupFailure(new Error("parse_failed"))).toBe("permanent");
  });

  it("detects RetryableFmcsaError", () => {
    expect(isRetryableFmcsaError(new RetryableFmcsaError("FMCSA timeout"))).toBe(true);
    expect(isRetryableFmcsaError(new Error("other"))).toBe(false);
  });
});
