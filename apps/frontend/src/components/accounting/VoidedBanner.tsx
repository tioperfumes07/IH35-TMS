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
 *     every viewer role sees a name, never a uuid. Optional and additive — a caller that hasn't wired
 *     the column yet (or a family where the write path doesn't populate it) still renders exactly as
 *     before, just without the "by <name>" clause; this NEVER fabricates an actor.
 *   - The timestamp now renders in Laredo Central Time via ctDateTime (was formatDateUS, which is UTC/
 *     browser-local and unlabeled) — matches the packet's explicit "Laredo Central Time" requirement.
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
  const { name: voidedByName } = useUserName(voidedAt ? voidedByUserId : null);
  if (!voidedAt) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-900">
        {documentLabel} is VOID
      </div>
      <div className="text-xs text-red-900">
        Voided {ctDateTime(voidedAt)}
        {voidedByName ? ` by ${voidedByName}` : ""}
        {voidReason ? ` — ${voidReason}` : ""}
      </div>
    </div>
  );
}
