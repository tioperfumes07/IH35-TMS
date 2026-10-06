import { Link } from "react-router-dom";
import type { SettlementReference } from "../../api/driverFinance";

/**
 * UI-F395 (owner, ROUND 395, verbatim: "IN SETTLEMENTS TOUR COLUMN INSTEAD OF HAVING OPEN, IT
 * SHOULD BE THE NUMBER ... ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE").
 *
 * ROOT CAUSE -- two defects, one cell, ~15 screens:
 *
 *  1. SECOND SYSTEM. ROUND 167 (owner, 2026-09-28) retired the status word that used to sit in this
 *     column and replaced it with the PENDING vocabulary, but it only landed in
 *     components/shared/SettlementRefCell.tsx -- declared there as "the ONE component". This cell,
 *     which backs the same column on another ~15 screens, was never migrated and kept printing the
 *     retired word. The owner is reading a screen served by THIS cell. Fixed by making both cells
 *     speak one vocabulary: Not on a tour / PENDING / the AlwaysTrack number / closed-unnumbered.
 *
 *  2. NOT CLICKABLE. "ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE" -- a PENDING row and a
 *     closed-but-unnumbered row both have a real settlement id, and both rendered as a dead <span>
 *     in both cells. Every state that has an id is now a link to that settlement.
 *
 * WHY NOT "the number" FOR AN OPEN TOUR -- measured, and it is the owner's own standing ruling.
 * Live on USMCA: all 13 open rows have source_document_ref = NULL and carry only their P-series
 * display_id ("P-0002".."P-0018"). ROUND 167 ruled on exactly that series, verbatim: "FOR THE
 * CURRENT LOADS WRITE PENDING SETTLEMENT NUMBER WHILE WE FINISH... THERE IS NO SETTLEMENT 001, 003,
 * 005, 007." So the P-series is a pre-settlement row id, not a settlement number, and PENDING is
 * the number-shaped truth until AlwaysTrack settles the tour. The retired status word dies either
 * way; it is replaced by PENDING, not by the P-series.
 *
 * Standing law kept intact:
 *  - ACCT-F20260911: the only human-visible settlement number is the AlwaysTrack document
 *    (source_document_ref). driver_settlements.display_id is never rendered as a number -- measured
 *    live, the 51 closed USMCA rows carry it in three shapes (28 raw "5769", 20 the banned counter
 *    "S-5797", 3 a stale "P-0015" whose real ref is 5817-5819), so it is not a fallback anywhere.
 *  - ROUND-SETTLEMENT-BESIDE-LOAD (owner, 2026-09-13): "not on a tour at all" stays its own state
 *    said in plain words, never a bare dash a reader could mistake for a loading glitch.
 */
export function SettlementReferenceCell({ reference }: { reference?: SettlementReference | null }) {
  const id = reference?.settlement_id ?? reference?.presettlement_id;
  const number = reference?.settlement_display_id ?? reference?.presettlement_display_id;
  const isClosed = Boolean(reference?.settlement_id);

  if (!id) return <span data-testid="settlement-reference-cell" className="text-gray-400">Not on a tour</span>;

  const linkClass = "font-medium tabular-nums text-[var(--accent-green)] hover:underline";
  const to = `/settlements/${id}`;

  if (number) {
    return (
      <Link className={linkClass} data-testid="settlement-reference-cell" to={to}>
        {number}
      </Link>
    );
  }

  // Closed but the AlwaysTrack document number has not been stamped yet -- a real, distinct case
  // from "no settlement at all". Keep the settlementNumber.ts dash, but make it reachable and say
  // why on hover instead of leaving an unexplained mark.
  if (isClosed) {
    return (
      <Link
        className="border-b border-dotted border-gray-400 text-gray-500 hover:text-gray-700"
        data-testid="settlement-reference-cell"
        title="Settlement closed, AlwaysTrack document number not yet stamped"
        to={to}
      >
        {"—"}
      </Link>
    );
  }

  // Open tour / pre-settlement: PENDING, and it goes somewhere.
  return (
    <Link
      className="font-medium text-slate-700 hover:underline"
      data-testid="settlement-reference-cell"
      title="Tour still open — the settlement number is minted when AlwaysTrack settles it"
      to={to}
    >
      PENDING
    </Link>
  );
}
