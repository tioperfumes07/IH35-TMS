import { formatDateUS } from "../../lib/formatDate";

/**
 * VIS-01 (owner requirement 4.x, register row VIS-01, 2026-09-01): "VOID banner at the top of the
 * detail view — every document." Before this, a voided document had no announcement at all on open
 * (some pages only carried a small inline `voided` StatusBadge chip, most had nothing). Shared
 * across every voidable document detail page so the treatment stays identical everywhere instead of
 * seven pages each re-deciding it — the same reasoning as FormErrorBanner.
 */
export function VoidedBanner({
  voidedAt,
  voidReason,
  documentLabel = "This document",
}: {
  voidedAt: string | null | undefined;
  voidReason?: string | null;
  documentLabel?: string;
}) {
  if (!voidedAt) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-900">
        {documentLabel} is VOID
      </div>
      <div className="text-xs text-red-900">
        Voided {formatDateUS(voidedAt)}
        {voidReason ? ` — ${voidReason}` : ""}
      </div>
    </div>
  );
}
