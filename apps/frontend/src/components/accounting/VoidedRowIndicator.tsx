import { StatusBadge } from "../layout/StatusBadge";

/**
 * R-102-B item 2 ("EVERY LIST ROW", owner packet ROUND 102.2): "A voided row is visibly voided
 * IN THE LIST, not only after you open it. Struck or badged — pick ONE treatment and use it in
 * all of them." §9.0.17 — ONE component, not eleven page edits.
 *
 * Picked BADGED, not struck-through: this codebase already has a strong red visual language for
 * void (VoidedBanner's border-red-200/bg-red-50/text-red-900), a plain CSS text-decoration:
 * line-through interacts badly with monospaced ids, drill-through link anchors and truncated
 * cells that already live in these rows, and doesn't work inside a `render:` cell that returns a
 * Link. A badge is unambiguous at any zoom level and matches how every other row-state (paid/
 * open/disputed/reconciled) is already communicated in these same tables.
 *
 * Wraps the existing `components/layout/StatusBadge` (locked GLOBAL-TYPE-SIZE-BASELINE component,
 * variant="crit") instead of a hand-rolled span — an arbitrary-value Tailwind font-size class
 * here would be a NEW off-scale literal even though it happens to match the same 10-pixel size
 * the locked badge token already uses (verify-ui-design-system-ratchet.mjs's regex counts the
 * raw class text itself — including inside a comment — not the resolved size; caught live on
 * first push: off_locked_scale_sizes 0 -> 1).
 *
 * Two pieces, used together (QuickBooks' own pattern — "VOID in the header and grey the money"):
 *   - `voidedRowClassName(row)` — pass to ParityTable's `rowClassName` prop to grey/dim the WHOLE
 *     row (same treatment regardless of which column the eye lands on first).
 *   - `<VoidedRowBadge />` — render inside whichever column already carries status/id for that
 *     table (callers place it, since ParityTable columns are caller-defined); shown only when
 *     the row's own voidedAt is set — this component never decides voidedness, the caller does,
 *     so a family whose write path doesn't populate voided_at yet simply never renders it (no
 *     fabrication, same discipline as VoidedBanner).
 */
export function voidedRowClassName(voidedAt: string | null | undefined): string {
  return voidedAt ? "opacity-60" : "";
}

export function VoidedRowBadge({ voidedAt }: { voidedAt: string | null | undefined }) {
  if (!voidedAt) return null;
  return (
    <span className="ml-1.5 inline-block" data-testid="voided-row-badge">
      <StatusBadge variant="crit">Voided</StatusBadge>
    </span>
  );
}
