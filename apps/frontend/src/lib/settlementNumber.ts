// ACCT-F20260911 (owner rulings 2026-09-11): the ONLY settlement / tour number a person ever sees is the
// AlwaysTrack document number (driver_finance.driver_settlements.source_document_ref: 5769 … 5800, then
// 5801 …). driver_settlements.display_id (S-YYYY-NNNN) is an internal counter and is NEVER rendered as a
// number. A closed row that has not been stamped yet renders as a dash. Every surface goes through this
// one helper so the rule cannot drift per screen.
//
// ROUND 167 (owner, verbatim, 2026-09-28): "FOR THE CURRENT LOADS WRITE PENDING SETTLEMENT NUMBER
// WHILE WE FINISH... THERE IS NO SETTLEMENT 001, 003, 005, 007." A load in flight has no settlement
// number -- it has a PENDING one; the number only exists once AlwaysTrack settles the tour. A row
// with is_presettlement=true renders "PENDING", never its internal P-series display_id (P-0001 etc
// -- a pre-settlement row id, not a settlement number) and never the retired "Open" label ("Open"
// described a STATUS, not a number, and is no longer a valid settlementLabel() output). This is a
// RENDER rule only: source_document_ref is the sole AlwaysTrack match key and stays NULL on a
// pre-settlement -- never write the literal string "PENDING" into the database.
// FIX A (ROUND 155.15 / 157-D item 1): the row type used to declare EVERY field optional as one
// flat object shape, so a row carrying NEITHER source_document_ref NOR settlement_number AT ALL --
// not merely both-absent-at-runtime, the KEY ITSELF never declared on the type -- still type-
// checked cleanly (a value can always omit an optional key) and settlementNumber() silently
// returned null at runtime. That was the exact bug that shipped "-" on all 48 Company Settlements
// rows: CompanySettlementListRow has neither key; it has its own display_id, which
// company-settlement-report.service.ts already resolves to the real AlwaysTrack number for that
// table -- unlike driver_finance.driver_settlements.display_id, an internal S-YYYY-NNNN counter
// (ACCT-F20260911).
//
// The fix is NOT "make the fields required" -- most real callers (driver_finance.driver_settlements
// rows) legitimately declare source_document_ref as OPTIONAL (it really can be null/absent before a
// tour is numbered) and never declare settlement_number at all; requiring non-optional presence
// broke every one of those real call sites. The actual bug is about KEY MEMBERSHIP, not value
// optionality: does the type mention source_document_ref or settlement_number AT ALL, even as an
// optional field? A generic constraint checked via `keyof` answers exactly that, and is what
// SettlementNumberSource is built from below -- HasSettlementNumberKey<T> is true when T declares
// either key (required or optional), false when T declares neither (the CompanySettlementListRow
// shape). settlementNumber/settlementLabel/isOpenSettlement are generic in T so this check runs at
// every call site: passing a row whose type has neither key is a COMPILE ERROR, never a silent
// runtime dash.
type CommonFields = {
  status?: string | null;
  is_open?: boolean | null;
  is_presettlement?: boolean | null;
};

type HasSettlementNumberKey<T> = "source_document_ref" extends keyof T
  ? true
  : "settlement_number" extends keyof T
    ? true
    : false;

/** @deprecated kept only so existing `: SettlementNumberSource` local variable annotations still
 *  resolve; prefer the generic settlementNumber<T>()/settlementLabel<T>() signatures for new code,
 *  which enforce HasSettlementNumberKey at every call site instead of at one shared alias. */
export type SettlementNumberSource =
  | ({ source_document_ref?: string | null; settlement_number?: string | null } & CommonFields)
  | null
  | undefined;

export function settlementNumber<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
  row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
): string | null {
  const r = row as ({ source_document_ref?: string | null; settlement_number?: string | null } & CommonFields) | null | undefined;
  const n = r?.source_document_ref ?? r?.settlement_number ?? null;
  return n ? String(n) : null;
}

export function isOpenSettlement<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
  row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
): boolean {
  const r = row as CommonFields | null | undefined;
  if (r?.is_open === true) return true;
  const s = String(r?.status ?? "").toLowerCase();
  return s === "open" || s === "ready_to_close" || s === "draft";
}

/** Label for links and headings: "PENDING" for anything still in flight -- a pre-settlement
 *  (is_presettlement=true) or an open/unclosed tour (isOpenSettlement -- is_open=true or
 *  status in open/ready_to_close/draft) -- never a P-series display_id, never the retired "Open"
 *  label (a status word, not a number). "5774" once AlwaysTrack has settled it, or "—" when
 *  closed but unnumbered. */
export function settlementLabel<T extends CommonFields & { source_document_ref?: string | null; settlement_number?: string | null }>(
  row: (HasSettlementNumberKey<T> extends true ? T : never) | null | undefined
): string {
  const r = row as CommonFields | null | undefined;
  if (r?.is_presettlement === true || isOpenSettlement(row)) return "PENDING";
  return settlementNumber(row) ?? "—";
}
