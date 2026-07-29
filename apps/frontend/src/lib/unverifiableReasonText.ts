/**
 * Turn an internal "why we could not verify this" code into a sentence the owner can act on.
 *
 * Home rendered these codes verbatim: USMCA read "Factoring balance unverifiable:
 * faro_contract_entity_mismatch". A snake_case identifier is a diagnostic, not an explanation — and in
 * that particular case it was not even a failure. Per the owner (2026-07-29): Faro is IH 35
 * Transportation's factor; USMCA "doesn't factor YET"; IH 35 Trucking does not factor at all — it is
 * the asset holder and leases equipment.
 *
 * The two are NOT the same state and the copy must not imply they are. TRK is a permanent exclusion.
 * USMCA is a not-yet, and its factoring roles are already being prepared (6 of 7 bound). The wording
 * below — "This entity has no factoring contract" — is true of both today and stops being shown for
 * USMCA the moment a contract exists, without anyone having to revisit this file.
 *
 * QuickBooks and NetSuite both separate "not configured for this entity" from "we could not compute
 * this". Anything genuinely unmapped falls back to the raw code rather than a vague phrase, so a NEW
 * failure mode is never silently smoothed into "something went wrong".
 */
const REASON_TEXT: Record<string, string> = {
  faro_contract_entity_mismatch: "This entity has no factoring contract",
  missing_operating_company: "No operating company is selected",
  no_invoices: "No invoices in range",
  no_factor_profile: "No factoring profile is configured for this entity",
};

export function unverifiableReasonText(reason: string | null | undefined): string {
  const key = String(reason ?? "").trim();
  if (!key) return "";
  // Unmapped codes are shown as-is ON PURPOSE: an unfamiliar code is a signal that a new failure mode
  // exists and needs its own sentence. Replacing it with "unknown error" would hide that.
  return REASON_TEXT[key] ?? key;
}

/** True when the reason describes an expected, not-applicable state rather than a fault. */
export function isNotApplicableReason(reason: string | null | undefined): boolean {
  return String(reason ?? "") === "faro_contract_entity_mismatch";
}
