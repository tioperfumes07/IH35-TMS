// ACC-50 — "Open tour posts nothing" (LAW §2, ROUND 5, owner order). A cost on an open tour
// accrues; it does not post. The GL entry is written when the tour (the driver's settlement for
// that load) closes.
//
// "Tour open" is CC-3's own measured definition (scripts/report-posted-expenses-while-tour-open.mjs):
// a load's tour = the driver_finance.driver_settlements row reached via
// driver_finance.driver_bills (by load_id) -> driver_finance.settlement_lines
// (source_driver_bill_id, is_active=true) -> driver_settlements (settlement_id). No settlement
// linked yet, or the linked settlement's status is not in OPEN_TOUR_STATUSES_EXCLUDED, means the
// tour is still open. Reused verbatim here — never a second, competing definition of "open."
import type { PoolClient } from "pg";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const TOUR_OPEN_HOLD_REASON = "tour_open" as const;

// Mirrors report-posted-expenses-while-tour-open.mjs's OPEN_TOUR_STATUSES_EXCLUDED and
// pre-settlement.routes.ts's own "open tour" gate exactly — one definition, reused, never
// reinvented.
// EXP-CLOSED-TOUR-VOCAB (owner 2026-09-07 "close them out ... expenses"): 'closed' and 'final' are
// terminal settlement statuses (driver_settlements status CHECK enum) and are BOTH in the pay-run
// poster's POSTABLE_STATUSES — a settlement in either state is GL-posted and by definition NOT open.
// USMCA's real settlements close to status='closed' (never 'approved'/'paid'), so omitting 'closed'
// here left every held tour-open load cost on a genuinely-closed, GL-posted tour stuck unposted.
// Widening this can only release held expenses on already-terminal tours; open/draft/etc. stay open.
//
// EXP-CLOSED-TOUR-VOCAB-2 (CC-3, 2026-09-22, ACCT-F30214 fuel-linkage-audit follow-on): 'locked'
// was missing too. The status CHECK enum (db/migrations/0143_...sql:34-40) orders the lifecycle
// 'draft'->'presettle'->'acked'->'locked'->'paid' — 'locked' sits in the SAME finalized/values-
// fixed tier as 'closed'/'final'/'approved'/'paid', reached via PATCH .../settlements/:id/finalize
// (settlements.routes.ts), which sets status='locked' and is a genuinely terminal close (its own
// comment there: "the finalize path's terminal close"). Confirmed live: S-2026-5786/5788 reached
// 'locked' via that route and left 4 expenses permanently stuck posting_status='unposted' because
// (a) 'locked' wasn't in this set, so isLoadTourOpen still reported their tour open, and (b) the
// finalize route never called postHeldDocumentsForClosedTour at all (only the MVP approve route
// does) — see settlements.routes.ts's finalize handler for that half of the fix. Widening this set
// can only release held expenses on an already-terminal tour; every non-terminal status keeps
// gating exactly as before.
const CLOSED_TOUR_STATUSES = new Set(["approved", "paid", "cancelled", "closed", "final", "locked"]);

/**
 * Is the given load's tour still open? A load with no driver_bill/settlement link yet is
 * treated as open (the tour hasn't even been assembled, let alone closed) — matching the report
 * script's own `!r.settlement_status || !CLOSED.includes(r.settlement_status)` logic.
 *
 * R-169 fix 3 (owner 2026-09-25, measured live on settlement 5812: TOTAL DUE -50.00, salary 0) —
 * the settlement_lines path alone missed a real close: a zero-pay settlement (driver owes the
 * company, no salary/mileage line) never earns a driver_finance.settlement_lines row at all, so
 * the LEFT JOIN chain above finds no settlement and reports the tour open forever, even after the
 * settlement itself closed. driver_bills.settled_in_settlement_id is stamped directly on the bill
 * at settlement time (independent of whether that settlement produced any pay line) and is the
 * more fundamental "which settlement did this load's tour settle into" signal. The tour is closed
 * when EITHER path resolves to a closed status — this only WIDENS what counts as closed, so an
 * open tour under the old logic stays open; the settlement_lines path is not removed, only no
 * longer the sole source of truth.
 */
export async function isLoadTourOpen(
  client: DbClient | PoolClient,
  operatingCompanyId: string,
  loadId: string
): Promise<boolean> {
  const res = await (client as DbClient).query<{ settlement_status: string | null }>(
    `
      SELECT ds.status AS settlement_status
      FROM driver_finance.driver_bills db
      LEFT JOIN driver_finance.settlement_lines sl
        ON sl.source_driver_bill_id = db.id AND sl.is_active = true
      LEFT JOIN driver_finance.driver_settlements ds
        ON ds.id = sl.settlement_id
      WHERE db.operating_company_id = $1::uuid
        AND db.load_id = $2::uuid
        AND db.status <> 'void'

      UNION ALL

      SELECT ds2.status AS settlement_status
      FROM driver_finance.driver_bills db2
      JOIN driver_finance.driver_settlements ds2
        ON ds2.id = db2.settled_in_settlement_id
      WHERE db2.operating_company_id = $1::uuid
        AND db2.load_id = $2::uuid
        AND db2.status <> 'void'
        AND db2.settled_in_settlement_id IS NOT NULL
    `,
    [operatingCompanyId, loadId]
  );
  const statuses = res.rows.map((r) => r.settlement_status).filter((s): s is string => Boolean(s));
  // Closed if ANY candidate settlement (settlement_lines path or settled_in_settlement_id path)
  // is closed. No resolved status at all, or every resolved status is non-terminal -> still open.
  return !statuses.some((s) => CLOSED_TOUR_STATUSES.has(s));
}

/**
 * accounting.expenses gate: does this expense carry a load_id whose tour is still open? Returns
 * null when the expense has no load_id at all (not a tour-linked cost — never gated).
 */
export async function expenseOpenTourLoadId(
  client: DbClient | PoolClient,
  operatingCompanyId: string,
  expenseId: string
): Promise<string | null> {
  const res = await (client as DbClient).query<{ load_id: string | null }>(
    `SELECT load_id::text AS load_id FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [expenseId, operatingCompanyId]
  );
  const loadId = res.rows[0]?.load_id ?? null;
  if (!loadId) return null;
  return (await isLoadTourOpen(client, operatingCompanyId, loadId)) ? loadId : null;
}

/**
 * accounting.bills gate: bills carry no load_id of their own (accounting.bills has no such
 * column, verified live) — the load linkage lives on accounting.bill_lines.load_id instead, since
 * one bill (e.g. a fuel-card statement) can span several loads. A bill posts as ONE document
 * (one JE for the whole bill, never split per line), so if ANY line names a load whose tour is
 * still open, the WHOLE bill holds — never a partial post. Returns the first open-tour load_id
 * found, or null if the bill has no load-linked line, or every load-linked line's tour is closed.
 */
export async function billOpenTourLoadId(
  client: DbClient | PoolClient,
  operatingCompanyId: string,
  billId: string
): Promise<string | null> {
  const res = await (client as DbClient).query<{ load_id: string | null }>(
    `
      SELECT DISTINCT bl.load_id::text AS load_id
      FROM accounting.bill_lines bl
      WHERE bl.bill_id = $1::uuid
        AND bl.operating_company_id = $2::uuid
        AND bl.load_id IS NOT NULL
        AND bl.voided_at IS NULL
    `,
    [billId, operatingCompanyId]
  );
  for (const row of res.rows) {
    if (!row.load_id) continue;
    if (await isLoadTourOpen(client, operatingCompanyId, row.load_id)) return row.load_id;
  }
  return null;
}

/** All load_ids whose tour this settlement bookends (via driver_bills <-> settlement_lines). Used
 *  at tour close to find every expense/bill that was held for these specific loads. */
export async function loadIdsForSettlement(
  client: DbClient | PoolClient,
  operatingCompanyId: string,
  settlementId: string
): Promise<string[]> {
  const res = await (client as DbClient).query<{ load_id: string }>(
    `
      SELECT DISTINCT db.load_id::text AS load_id
      FROM driver_finance.driver_bills db
      JOIN driver_finance.settlement_lines sl
        ON sl.source_driver_bill_id = db.id AND sl.is_active = true
      WHERE sl.settlement_id = $1::uuid
        AND db.operating_company_id = $2::uuid
        AND db.status <> 'void'
        AND db.load_id IS NOT NULL
    `,
    [settlementId, operatingCompanyId]
  );
  return res.rows.map((r) => r.load_id);
}
