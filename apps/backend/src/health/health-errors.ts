/**
 * Shared health error types — kept out of health.routes.ts so financial check modules
 * can throw HealthCheckError without a circular import into registerHealthRoutes.
 */
export const HEALTH_ERROR_GENERIC = "check_failed";

/** A public health code is a fixed literal: lowercase, underscores, no interpolated values. */
const PUBLIC_HEALTH_CODE = /^[a-z0-9_]{1,48}$/;

/**
 * A check failure the endpoint is ALLOWED to name publicly. `publicCode` is the bounded token that
 * reaches anonymous callers; `detail` (counts, dollars, ids) stays in the server-side log only.
 */
export class HealthCheckError extends Error {
  readonly publicCode: string;

  constructor(publicCode: string, detail?: string) {
    super(detail ? `${publicCode}: ${detail}` : publicCode);
    this.name = "HealthCheckError";
    this.publicCode = PUBLIC_HEALTH_CODE.test(publicCode) ? publicCode : HEALTH_ERROR_GENERIC;
  }
}

/** The ONLY way an error may become response text. Undeclared ⇒ generic. */
export function toPublicHealthErrorCode(error: unknown): string {
  if (error instanceof HealthCheckError && PUBLIC_HEALTH_CODE.test(error.publicCode)) {
    return error.publicCode;
  }
  return HEALTH_ERROR_GENERIC;
}
