// [HOLD-FOR-JORGE — TIER 1] Task #24 — pure helpers that thread the catalog reason + note + the gated
// TMS→QBO void mirror + the closed-period register flag. No DB, no GL math — unit-testable logic only.

/**
 * TMS→QBO void mirror flag. DEFAULT OFF (registered in lib.feature_flags via migration; isEnabled() also
 * returns false when the row is absent, so this is safe-OFF regardless). When OFF, a void writes NOTHING
 * to QuickBooks — the register surfaces guidance to void it in QBO manually. When later flipped ON (per
 * entity, with Jorge's OK), the hook would mirror the void to QBO. This block ships the OFF branch only.
 */
export const VOID_QBO_MIRROR_FLAG_KEY = "VOID_QBO_MIRROR_ENABLED";

export type QboVoidMirror = {
  enabled: boolean;
  wrote_to_qbo: boolean;
  guidance: string | null;
};

/**
 * The register-facing QBO mirror descriptor. While OFF, wrote_to_qbo is ALWAYS false and guidance is set;
 * this function never performs a QBO write — the ON branch (actual mirror) is intentionally not built yet.
 */
export function buildQboVoidMirror(enabled: boolean): QboVoidMirror {
  if (!enabled) {
    return {
      enabled: false,
      wrote_to_qbo: false,
      guidance: "Not sent to QuickBooks (TMS→QBO void mirror is off). Also void the matching transaction in QuickBooks.",
    };
  }
  // Flag ON is not shipped in this block; still write nothing here (the mirror hook lands in a follow-up).
  return {
    enabled: true,
    wrote_to_qbo: false,
    guidance: "QuickBooks void mirror is enabled but not yet wired; void the matching transaction in QuickBooks.",
  };
}

export type ReasonNoteValidation = { ok: true } | { ok: false; error: string; message: string };

/**
 * Mirror of governance.enforce_void_cancel_request_reason()'s note-required rule (migration 202606300030)
 * so the API returns a clean 400 instead of letting the DB trigger throw a raw 500. A reason with
 * requires_note=true MUST carry a non-blank note_text.
 */
export function validateReasonNote(
  requiresNote: boolean,
  noteText: string | null | undefined
): ReasonNoteValidation {
  if (requiresNote && (noteText == null || noteText.trim() === "")) {
    return { ok: false, error: "note_required", message: "This reason requires a note." };
  }
  return { ok: true };
}

/**
 * Mirror of the trigger's same-entity rule: the chosen reason must belong to the SAME operating company as
 * the request. Cross-entity reasons are forbidden (the DB trigger is the final net; this is the clean 400).
 */
export function reasonEntityMatches(reasonOpco: string, requestOpco: string): boolean {
  return reasonOpco === requestOpco;
}

/**
 * Register-facing closed-period descriptor. The reversal ALWAYS dates into the current open period
 * (void.service.resolveReversalDate); this only tells the register UI to show a "touches closed period"
 * badge so the operator knows the original sat in a closed period.
 */
export function buildClosedPeriodFlag(closedPeriodReversal: boolean): { touches_closed_period: boolean; note: string | null } {
  return closedPeriodReversal
    ? {
        touches_closed_period: true,
        note: "The original transaction is in a closed period; the reversal was dated into the current open period.",
      }
    : { touches_closed_period: false, note: null };
}
