// ACCT-F20260911 (owner rulings 2026-09-11): the ONLY settlement / tour number a person ever sees is the
// AlwaysTrack document number (driver_finance.driver_settlements.source_document_ref: 5769 … 5800, then
// 5801 …). driver_settlements.display_id (S-YYYY-NNNN) is an internal counter and is NEVER rendered as a
// number. An open pre-settlement has no number until the tour closes — it renders as "Open"; a closed
// row that has not been stamped yet renders as a dash. Every surface goes through this one helper so the
// rule cannot drift per screen.
export type SettlementNumberSource = {
  source_document_ref?: string | null;
  settlement_number?: string | null;
  status?: string | null;
  is_open?: boolean | null;
} | null | undefined;

export function settlementNumber(row: SettlementNumberSource): string | null {
  const n = row?.source_document_ref ?? row?.settlement_number ?? null;
  return n ? String(n) : null;
}

export function isOpenSettlement(row: SettlementNumberSource): boolean {
  if (row?.is_open === true) return true;
  const s = String(row?.status ?? "").toLowerCase();
  return s === "open" || s === "ready_to_close" || s === "draft";
}

/** Label for links and headings: "5774", or "Open" for an unclosed tour, or "—" when closed but unnumbered. */
export function settlementLabel(row: SettlementNumberSource): string {
  return settlementNumber(row) ?? (isOpenSettlement(row) ? "Open" : "—");
}
