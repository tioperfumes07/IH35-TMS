/**
 * FMCSA SAFER lookup error taxonomy for durable outbox retry.
 * Transient → outbox retries. Permanent → job completes or fails closed without retry.
 */

export class RetryableFmcsaError extends Error {
  readonly retryable = true as const;

  constructor(message: string) {
    super(message);
    this.name = "RetryableFmcsaError";
  }
}

export function isRetryableFmcsaError(error: unknown): error is RetryableFmcsaError {
  if (error instanceof RetryableFmcsaError) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { retryable?: unknown; name?: unknown }).retryable === true
    || (error as { name?: unknown }).name === "RetryableFmcsaError";
}

/** Classify raw FMCSA/network failures into retryable vs permanent. */
export function classifyFmcsaLookupFailure(error: unknown): "retryable" | "permanent" {
  const message = String((error as Error)?.message ?? error ?? "");
  if (/timeout/i.test(message)) return "retryable";
  if (/FMCSA (mobile|SAFER) service error 5\d\d/i.test(message)) return "retryable";
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network/i.test(message)) return "retryable";
  if (/429|rate.?limit|Too Many Requests/i.test(message)) return "retryable";
  return "permanent";
}
