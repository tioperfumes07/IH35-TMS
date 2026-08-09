import { ApiError } from "../api/client";

const BARE_E_CODE = /^E_[A-Z0-9_]+$/;

/** Turn `E_DRIVER_REPAIR_BLOCK` into a short operator sentence (never toast the raw code alone). */
export function humanizeErrorCode(code: string): string {
  const trimmed = code.trim();
  if (!BARE_E_CODE.test(trimmed)) return trimmed;
  return trimmed.replace(/^E_/, "").replace(/_/g, " ").toLowerCase();
}

/**
 * CU-09 / CLS-BARE-ERROR — prefer `message` / `blocker` / details, never a bare `E_*` code.
 * Use for every operator toast / submitError from an API catch.
 */
export function userFacingApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = (err.data as Record<string, unknown> | null) ?? {};
    const details = data.details as Record<string, unknown> | undefined;
    if (details) {
      if (typeof details.message === "string" && details.message.trim()) return details.message.trim();
      const fieldErrors = details.fieldErrors as Record<string, string[]> | undefined;
      const firstField = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      if (firstField) return firstField;
    }
    for (const key of ["message", "blocker", "error_description", "detail"] as const) {
      const v = data[key];
      if (typeof v === "string" && v.trim()) {
        const text = v.trim();
        if (BARE_E_CODE.test(text)) return `${fallback}: ${humanizeErrorCode(text)}`;
        return text;
      }
    }
    if (typeof data.error === "string" && data.error.trim()) {
      const code = data.error.trim();
      if (BARE_E_CODE.test(code)) return `${fallback}: ${humanizeErrorCode(code)}`;
      return `${fallback}: ${code}`;
    }
    if (err.message && !BARE_E_CODE.test(err.message.trim())) return err.message;
    if (err.message && BARE_E_CODE.test(err.message.trim())) {
      return `${fallback}: ${humanizeErrorCode(err.message)}`;
    }
    return `${fallback} (HTTP ${err.status}).`;
  }
  if (err instanceof Error && err.message.trim()) {
    const text = err.message.trim();
    if (BARE_E_CODE.test(text)) return `${fallback}: ${humanizeErrorCode(text)}`;
    return text;
  }
  return fallback;
}
