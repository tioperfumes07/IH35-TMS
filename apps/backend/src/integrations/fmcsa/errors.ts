/**
 * FMCSA SAFER lookup error taxonomy for durable outbox retry.
 * Re-exports typed client errors + classification helpers used by safer/outbox.
 */

export {
  FmcsaPermanentError,
  FmcsaRetryableError,
  clampRetryAfterMs,
  isFmcsaPermanentError,
  isFmcsaRetryableError,
  parseRetryAfterMs,
  retryAfterMsFromError,
  FMCSA_RETRY_AFTER_MAX_MS,
  FMCSA_RETRY_AFTER_MIN_MS,
} from "../../lib/fmcsa-http-errors.js";

import {
  FmcsaPermanentError,
  FmcsaRetryableError,
  isFmcsaPermanentError,
  isFmcsaRetryableError,
} from "../../lib/fmcsa-http-errors.js";

/** @deprecated Prefer FmcsaRetryableError — kept as alias for existing imports/tests. */
export class RetryableFmcsaError extends FmcsaRetryableError {
  constructor(message: string, opts?: { status?: number | null; retryAfterMs?: number | null }) {
    super(message, opts);
    this.name = "RetryableFmcsaError";
  }
}

export function isRetryableFmcsaError(error: unknown): error is RetryableFmcsaError | FmcsaRetryableError {
  return isFmcsaRetryableError(error);
}

/** Classify raw FMCSA/network failures into retryable vs permanent. */
export function classifyFmcsaLookupFailure(error: unknown): "retryable" | "permanent" {
  if (isFmcsaRetryableError(error)) return "retryable";
  if (isFmcsaPermanentError(error)) return "permanent";
  const message = String((error as Error)?.message ?? error ?? "");
  if (/timeout/i.test(message)) return "retryable";
  if (/FMCSA (mobile|SAFER) service error 5\d\d/i.test(message)) return "retryable";
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network/i.test(message)) return "retryable";
  if (/429|rate.?limit|Too Many Requests/i.test(message)) return "retryable";
  if (/FmcsaPermanentError|permanent/i.test(message)) return "permanent";
  return "permanent";
}

export { FmcsaPermanentError as PermanentFmcsaError };
