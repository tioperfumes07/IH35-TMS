/**
 * Typed FMCSA HTTP/network error taxonomy (shared by fmcsa-client + safer/outbox).
 * Retryable = durable outbox backoff. Permanent = fail closed without cache stamp.
 */

export const FMCSA_RETRY_AFTER_MIN_MS = 1_000;
export const FMCSA_RETRY_AFTER_MAX_MS = 3_600_000; // 1 hour bound

export class FmcsaRetryableError extends Error {
  readonly retryable = true as const;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(message: string, opts?: { status?: number | null; retryAfterMs?: number | null }) {
    super(message);
    this.name = "FmcsaRetryableError";
    this.status = opts?.status ?? null;
    this.retryAfterMs = opts?.retryAfterMs ?? null;
  }
}

export class FmcsaPermanentError extends Error {
  readonly permanent = true as const;
  readonly status: number | null;

  constructor(message: string, opts?: { status?: number | null }) {
    super(message);
    this.name = "FmcsaPermanentError";
    this.status = opts?.status ?? null;
  }
}

export function isFmcsaRetryableError(error: unknown): error is FmcsaRetryableError {
  if (error instanceof FmcsaRetryableError) return true;
  if (!error || typeof error !== "object") return false;
  return (
    (error as { retryable?: unknown }).retryable === true ||
    (error as { name?: unknown }).name === "FmcsaRetryableError" ||
    (error as { name?: unknown }).name === "RetryableFmcsaError"
  );
}

export function isFmcsaPermanentError(error: unknown): error is FmcsaPermanentError {
  if (error instanceof FmcsaPermanentError) return true;
  if (!error || typeof error !== "object") return false;
  return (
    (error as { permanent?: unknown }).permanent === true ||
    (error as { name?: unknown }).name === "FmcsaPermanentError"
  );
}

/** Parse Retry-After (seconds or HTTP-date) into bounded milliseconds. */
export function parseRetryAfterMs(header: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (header == null) return null;
  const raw = String(header).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return clampRetryAfterMs(Math.round(seconds * 1000));
  }

  const when = Date.parse(raw);
  if (!Number.isFinite(when)) return null;
  return clampRetryAfterMs(when - nowMs);
}

export function clampRetryAfterMs(ms: number): number {
  if (!Number.isFinite(ms)) return FMCSA_RETRY_AFTER_MIN_MS;
  return Math.min(FMCSA_RETRY_AFTER_MAX_MS, Math.max(FMCSA_RETRY_AFTER_MIN_MS, Math.floor(ms)));
}

export function retryAfterMsFromError(error: unknown): number | null {
  if (!isFmcsaRetryableError(error)) return null;
  const value = (error as FmcsaRetryableError).retryAfterMs;
  if (value == null || !Number.isFinite(value)) return null;
  return clampRetryAfterMs(value);
}
