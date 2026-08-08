/**
 * CLS-SILENT-CAP — the one place a truncated list admits it is truncated.
 *
 * THE DEFECT this exists to end: a screen fetches a hard cap (`limit: 200`, `LIMIT 500`) and renders
 * whatever comes back with no count, no pager and no hint. Row 201 simply does not exist as far as the
 * user is concerned. A cap the caller cannot see is indistinguishable from "there is no more data" —
 * nothing errors, nothing is empty, and the missing rows are silently absent. It shipped that way on
 * legal.matters (LIMIT 500, no offset, no total) and on the drivers export, where the cap exceeded the
 * backend's own max so the request 400'd and produced NO file AND NO error.
 *
 * WHY ONE COMPONENT RATHER THAN A FIX PER SCREEN: the honest disclosure is identical everywhere, and
 * writing it per screen is how it ends up written nowhere. This renders NOTHING when the list is not
 * capped, so it is safe to place unconditionally under any capped list.
 *
 * IT COVERS BOTH SHAPES, which is why it takes `total` as optional:
 *   · a LIST surface that knows its total  → "Showing 200 of 4,213" + how to see the rest
 *   · a searchable PICKER with no total    → "Showing the first 200 — type to search" which is the
 *     correct, honest UI for a server-searched catalog that legitimately exceeds one page
 *
 * NOT A LICENCE TO CAP. Surfacing the cap is the floor, not the fix: a list surface that a user must
 * page through still owes a pager. This makes the truncation VISIBLE so it can never again be silent.
 */

export type CappedListNoticeProps = {
  /** Rows actually rendered. */
  shown: number;
  /** The hard cap that was requested. Capped == `shown >= limit`. */
  limit: number;
  /** Server total when the endpoint returns one (the mdata list endpoints do). */
  total?: number | null;
  /** What the user can do about it — "refine the filters", "type to search". */
  hint?: string;
  /** Test hook / styling escape hatch. */
  className?: string;
};

export function CappedListNotice({ shown, limit, total, hint, className }: CappedListNoticeProps) {
  const knownTotal = typeof total === "number" && Number.isFinite(total) ? total : null;

  // Prefer the server's own answer when we have it: a total at or below what is on screen means
  // nothing is hidden, whatever the cap was. Only fall back to the cap heuristic when there is no total.
  const capped = knownTotal !== null ? knownTotal > shown : shown >= limit;
  if (!capped) return null;

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <p className={className ?? "capped-list-notice"} data-testid="capped-list-notice" role="status">
      {knownTotal !== null
        ? `Showing ${fmt(shown)} of ${fmt(knownTotal)}.`
        : `Showing the first ${fmt(shown)}.`}{" "}
      {hint ?? "This list is truncated — narrow the filters to see the rest."}
    </p>
  );
}

export default CappedListNotice;
