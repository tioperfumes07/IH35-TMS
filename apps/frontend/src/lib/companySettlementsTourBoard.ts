import type { TourListRow } from "../api/tourReadout";

/** Stable ParityTable / export identity for the Company Settlements board (443.282 one row per tour). */
export function companySettlementsBoardRowKey(r: TourListRow): string {
  if (r.tour_id) return `tour:${r.tour_id}`;
  if (r.company_settlement_id) return `cs:${r.company_settlement_id}`;
  return `settlement:${r.settlement_id}`;
}

function canonicalScore(r: TourListRow): number {
  const companyDoc = r.company_settlement_id ? 1_000_000_000_000 : 0;
  const closedMs = r.trip_closed_at ? Date.parse(r.trip_closed_at) : 0;
  const numbered = r.settlement_number ? 1 : 0;
  return companyDoc + closedMs + numbered;
}

function pickCanonicalTourRow(existing: TourListRow, candidate: TourListRow): TourListRow {
  return canonicalScore(candidate) >= canonicalScore(existing) ? candidate : existing;
}

/**
 * Company Settlements board grain is one row per tour (Settlements-Company.dc.html), not one row per
 * driver_settlement id. listTours(closed) is settlement-keyed; collapse duplicates that share tour_id
 * or the same company_settlement_id before rendering KPIs and ParityTable.
 */
export function dedupeCompanySettlementsTourBoardRows(rows: TourListRow[]): TourListRow[] {
  if (rows.length <= 1) return rows;
  const winner = new Map<string, TourListRow>();
  for (const row of rows) {
    const key = companySettlementsBoardRowKey(row);
    const prev = winner.get(key);
    winner.set(key, prev ? pickCanonicalTourRow(prev, row) : row);
  }
  const seen = new Set<string>();
  const out: TourListRow[] = [];
  for (const row of rows) {
    const key = companySettlementsBoardRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(winner.get(key)!);
  }
  return out;
}
