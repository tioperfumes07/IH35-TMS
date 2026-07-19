import { describe, expect, it } from "vitest";
import {
  classifyFmcsaLookupFailure,
  FmcsaPermanentError,
  FmcsaRetryableError,
  isRetryableFmcsaError,
  RetryableFmcsaError,
} from "../errors.js";

describe("FMCSA error taxonomy", () => {
  it("classifies typed retryable / permanent first", () => {
    expect(classifyFmcsaLookupFailure(new FmcsaRetryableError("FMCSA timeout"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new FmcsaPermanentError("FMCSA mobile client error 403", { status: 403 }))).toBe(
      "permanent"
    );
  });

  it("classifies message fallbacks for timeouts and 5xx as retryable", () => {
    expect(classifyFmcsaLookupFailure(new Error("FMCSA timeout"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("FMCSA mobile service error 503"))).toBe("retryable");
    expect(classifyFmcsaLookupFailure(new Error("429 Too Many Requests"))).toBe("retryable");
  });

  it("detects RetryableFmcsaError alias", () => {
    expect(isRetryableFmcsaError(new RetryableFmcsaError("FMCSA timeout"))).toBe(true);
    expect(isRetryableFmcsaError(new Error("other"))).toBe(false);
  });
});
