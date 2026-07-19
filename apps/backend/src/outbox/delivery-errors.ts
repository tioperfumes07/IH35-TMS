/**
 * Outbox delivery error taxonomy.
 * - Retryable (default Error): processor schedules next_retry_at with backoff+jitter.
 * - PermanentDeliveryError: processor marks failed_at immediately (no further retries).
 */

export class PermanentDeliveryError extends Error {
  readonly permanent = true as const;

  constructor(message: string) {
    super(message);
    this.name = "PermanentDeliveryError";
  }
}

export function isPermanentDeliveryError(error: unknown): error is PermanentDeliveryError {
  if (error instanceof PermanentDeliveryError) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { permanent?: unknown; name?: unknown }).permanent === true
    || (error as { name?: unknown }).name === "PermanentDeliveryError";
}
