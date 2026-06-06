import type * as Sentry from "@sentry/node";

/**
 * PII field names that must never reach Sentry.
 * Covers SSNs, medical identifiers, driver license numbers, and email addresses.
 */
const PII_FIELD_NAMES = new Set([
  "ssn",
  "social_security_number",
  "social_security",
  "medical_card_number",
  "medical_card",
  "driver_license_number",
  "driver_license",
  "license_number",
  "email",
  "password",
  "token",
  "authorization",
]);

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELD_NAMES.has(key.toLowerCase())) {
      result[key] = "[Filtered]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function redactString(value: string): string {
  // Redact SSN patterns: 9-digit sequences with optional dashes (e.g. 123-45-6789)
  return value.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[SSN-Filtered]");
}

export function buildSentryBeforeSend(
  event: Sentry.ErrorEvent,
  _hint: Sentry.EventHint
): Sentry.ErrorEvent | null {
  if (event.request) {
    if (event.request.data && typeof event.request.data === "object") {
      event.request.data = redactObject(event.request.data as Record<string, unknown>);
    }
    if (event.request.headers) {
      event.request.headers = redactObject(
        event.request.headers as Record<string, unknown>
      ) as typeof event.request.headers;
    }
    if (event.request.query_string && typeof event.request.query_string === "string") {
      event.request.query_string = redactString(event.request.query_string);
    }
  }
  if (event.extra && typeof event.extra === "object") {
    event.extra = redactObject(event.extra as Record<string, unknown>);
  }
  return event;
}

export function buildSentryBeforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
  _hint?: Sentry.BreadcrumbHint
): Sentry.Breadcrumb | null {
  if (breadcrumb.data && typeof breadcrumb.data === "object") {
    breadcrumb.data = redactObject(breadcrumb.data as Record<string, unknown>);
  }
  if (breadcrumb.message && typeof breadcrumb.message === "string") {
    breadcrumb.message = redactString(breadcrumb.message);
  }
  return breadcrumb;
}
