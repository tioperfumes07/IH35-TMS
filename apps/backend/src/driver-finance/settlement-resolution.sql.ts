/**
 * ACCT-F26140 follow-up (Lead-directed, 2026-09-11 16:25 Central): the single canonical predicate
 * for "this driver bill has a real, ACTIVE settlement attachment via
 * driver_finance.settlement_lines.source_driver_bill_id" — shared by every surface that resolves
 * or checks a driver bill's settlement, so they can never silently disagree again.
 *
 * ROOT CAUSE this follow-up fixes: bills.routes.ts's DRIVER_BILL_REGISTER_SQL (the register,
 * fixed by PR #21826) correctly excludes cancelled/voided settlements and settlement_lines.
 * driver-bills-list.routes.ts and cash-flow.service.ts (fixed by PR #21833, same session) did
 * NOT — they resolved/counted a bill as "settled" even when its only settlement_lines row pointed
 * at a CANCELLED settlement. Measured live: register = 27/66 real settlement numbers; the other
 * two surfaces = 60/66, the extra 33 being cancelled-settlement false positives (12 settlements
 * cancelled by the 2026-09-11 reverse+repost rebuild). A cancelled settlement shown as "settled"
 * on screen is a false claim.
 *
 * A settlement attachment counts ONLY when the line is active/non-voided AND the settlement
 * itself is non-voided and not void/voided/cancelled. Every consumer below MUST import from here
 * — never re-type this predicate inline (that is exactly how the three surfaces drifted apart).
 */
import { activeSettlementLine, liveSettlement, liveDriverBill } from "../accounting/live-document-predicates.sql.js";
// Inlined as a template literal so verify-bills-settlement-column-linkage can statically extract the SQL text.
// Equivalent to activeSettlementLine("sl", "ds") but uses the guard-required token order for NOT IN.
export const ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL = `(sl.is_active = true AND sl.voided_at IS NULL AND (ds.status NOT IN ('void', 'voided', 'cancelled') AND ds.voided_at IS NULL AND ds.reversed_at IS NULL))`;

/**
 * LEFT JOIN LATERAL resolving exactly one active settlement identity for a driver bill aliased
 * `db` — columns `settlement_id` (text) and `settlement_number` (display id). Unique-or-unknown:
 * `HAVING count(DISTINCT ds.id) = 1` means a bill linked to more than one conflicting active
 * settlement resolves to NULL rather than guessing. Aliases `settlement`.
 */
export const RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL = `LEFT JOIN LATERAL (
             SELECT min(ds.id::text) AS settlement_id, min(ds.source_document_ref) AS settlement_number
               FROM driver_finance.settlement_lines sl
               JOIN driver_finance.driver_settlements ds
                 ON ds.id = sl.settlement_id AND ds.operating_company_id = db.operating_company_id
              WHERE sl.source_driver_bill_id = db.id
                AND sl.operating_company_id = db.operating_company_id
                AND ${ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL}
             HAVING count(DISTINCT ds.id) = 1
           ) settlement ON true`;

/**
 * EXISTS-shaped check: does this driver bill (aliased `db`) have a real, ACTIVE settlement
 * attachment? For filter-only call sites (e.g. cash-flow's "is this bill already settled, so
 * exclude it from open obligations" check) that don't need the resolved id/number, only the
 * boolean.
 */
export const BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL = `EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
    JOIN driver_finance.driver_settlements ds
      ON ds.id = sl.settlement_id AND ds.operating_company_id = db.operating_company_id
    WHERE sl.source_driver_bill_id = db.id
      AND sl.operating_company_id = db.operating_company_id
      AND ${ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL})`;

/**
 * 443.210R ONE-SETTLEMENT-RESOLVER — the single canonical per-load settlement resolver.
 * Replaces six inline resolvers (board settlement_info, rollup, tour COALESCE, resolveSettlementForLoad,
 * driver-pay-detail, shared settlement-resolution) that silently drifted apart.
 *
 * Precedence (D5 root cause fix):
 *   1. Active line on a CLOSED or LOCKED settlement — the load's money is finalized; this wins.
 *   2. Live presettlement_link_id on the load — the booking link (forward pointer from load to open settlement).
 *   3. Any active settlement_lines row for a live bill on this load — bookend / fallback.
 * Returns NULL when no settlement is attached. Aliases `load_settlement`.
 * Caller must alias the load row as `${loadAlias}`.
 */
export function resolveLoadSettlementSql(loadAlias: string): string {
  return `LEFT JOIN LATERAL (
    SELECT ds.id::text AS settlement_id, ds.source_document_ref AS settlement_number
      FROM driver_finance.driver_settlements ds
     WHERE ds.operating_company_id = ${loadAlias}.operating_company_id
       AND ${liveSettlement("ds")}
       AND ds.id = COALESCE(
         -- 1. Active line on closed/locked settlement (settled money is final)
         (SELECT sl1.settlement_id
            FROM driver_finance.settlement_lines sl1
            JOIN driver_finance.driver_settlements ds1
              ON ds1.id = sl1.settlement_id
             AND ds1.operating_company_id = ${loadAlias}.operating_company_id
             AND ${liveSettlement("ds1")}
             AND ds1.status IN ('closed', 'locked')
            JOIN driver_finance.driver_bills db1
              ON db1.id = sl1.source_driver_bill_id
             AND db1.load_id = ${loadAlias}.id
             AND db1.operating_company_id = ${loadAlias}.operating_company_id
             AND ${liveDriverBill("db1")}
           WHERE ${activeSettlementLine("sl1", "ds1")}
             AND sl1.operating_company_id = ${loadAlias}.operating_company_id
           ORDER BY ds1.trip_closed_at DESC NULLS LAST, sl1.created_at DESC
           LIMIT 1),
         -- 2. Live presettlement_link_id (booking-time forward pointer, if not voided)
         (SELECT ${loadAlias}.presettlement_link_id
           WHERE ${loadAlias}.presettlement_link_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM driver_finance.driver_settlements ds2
                WHERE ds2.id = ${loadAlias}.presettlement_link_id
                  AND ds2.operating_company_id = ${loadAlias}.operating_company_id
                  AND ${liveSettlement("ds2")}
             )),
         -- 3. Any active line (bookend / fallback)
         (SELECT sl3.settlement_id
            FROM driver_finance.settlement_lines sl3
            JOIN driver_finance.driver_bills db3
              ON db3.id = sl3.source_driver_bill_id
             AND db3.load_id = ${loadAlias}.id
             AND db3.operating_company_id = ${loadAlias}.operating_company_id
             AND ${liveDriverBill("db3")}
            JOIN driver_finance.driver_settlements ds3
              ON ds3.id = sl3.settlement_id
             AND ds3.operating_company_id = ${loadAlias}.operating_company_id
             AND ${liveSettlement("ds3")}
           WHERE ${activeSettlementLine("sl3", "ds3")}
             AND sl3.operating_company_id = ${loadAlias}.operating_company_id
           ORDER BY sl3.created_at DESC
           LIMIT 1)
       )
     LIMIT 1
  ) load_settlement ON true`;
}
