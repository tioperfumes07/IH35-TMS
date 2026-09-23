import { ctDateTime } from "../../lib/businessDate";
import { useUserName } from "../../hooks/useUserName";

/**
 * VIS-01 (owner requirement 4.x, register row VIS-01, 2026-09-01): "VOID banner at the top of the
 * detail view — every document." Before this, a voided document had no announcement at all on open
 * (some pages only carried a small inline `voided` StatusBadge chip, most had nothing). Shared
 * across every voidable document detail page so the treatment stays identical everywhere instead of
 * seven pages each re-deciding it — the same reasoning as FormErrorBanner.
 *
 * R-102-B (owner, 2026-09-23, ROUND 102.2 — "A VOIDED DOCUMENT MUST READ VOIDED ON THE SCREEN"):
 * "Every document detail screen, above the fold, unmissable: VOIDED · the void_reason in words · who
 * voided it (voided_by_user_id resolved to the person's name, never a raw uuid) · when (voided_at,
 * Laredo Central Time)." §9.0.17 — ONE component, not eleven page edits — is why this file, not each
 * of the 11 call sites, grew the two new capabilities below:
 *   - `voidedByUserId`: resolved via useUserName (wraps GET /identity/users/:id, no role gate) so
 *     every viewer role sees a name, never a uuid.
 *   - The timestamp now renders in Laredo Central Time via ctDateTime (was formatDateUS, which is UTC/
 *     browser-local and unlabeled) — matches the packet's explicit "Laredo Central Time" requirement.
 *
 * ROUND 112 CORRECTION (owner, verbatim): "a voider CAN be missing — invoices 13541 and 13572 are
 * voided with a reason and no actor. Render 'voided by — unknown'. Never crash, never hide the
 * stamp, never invent an actor." The first cut of this component OMITTED the "by" clause entirely
 * when voidedByUserId was absent — silently dropping the fact that the actor is unknown instead of
 * saying so. Fixed: the actor slot now always renders once we know there's nothing to show (no id
 * at all, or the id failed to resolve) — "by — unknown" — and stays blank only while a REAL id is
 * still in flight, so it never flashes "unknown" for a name that's a beat away from loading.
 */
export function VoidedBanner({
  voidedAt,
  voidReason,
  voidedByUserId,
  documentLabel = "This document",
}: {
  voidedAt: string | null | undefined;
  voidReason?: string | null;
  voidedByUserId?: string | null;
  documentLabel?: string;
}) {
  const { name: voidedByName, isLoading } = useUserName(voidedAt ? voidedByUserId : null);
  if (!voidedAt) return null;
  // ROUND 112 — always resolve to a definite actor label once we know one either way; only stays
  // null while a real id is still being fetched (avoids an "unknown" flash before the name loads).
  const actorLabel = !voidedByUserId ? "— unknown" : isLoading ? null : voidedByName ?? "— unknown";
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-900">
        {documentLabel} is VOID
      </div>
      <div className="text-xs text-red-900">
        Voided {ctDateTime(voidedAt)}
        {actorLabel != null ? ` by ${actorLabel}` : ""}
        {voidReason ? ` — ${voidReason}` : ""}
      </div>
    </div>
  );
}
