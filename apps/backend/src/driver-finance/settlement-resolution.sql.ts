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
export const ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL =
  `sl.is_active = true AND sl.voided_at IS NULL AND ds.voided_at IS NULL AND ds.status NOT IN ('void', 'voided', 'cancelled')`;

/**
 * LEFT JOIN LATERAL resolving exactly one active settlement identity for a driver bill aliased
 * `db` — columns `settlement_id` (text) and `settlement_number` (display id). Unique-or-unknown:
 * `HAVING count(DISTINCT ds.id) = 1` means a bill linked to more than one conflicting active
 * settlement resolves to NULL rather than guessing. Aliases `settlement`.
 */
export const RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL = `LEFT JOIN LATERAL (
             SELECT min(ds.id::text) AS settlement_id, min(ds.display_id) AS settlement_number
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
export const BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL = `EXISTS (
          SELECT 1 FROM driver_finance.settlement_lines sl
          JOIN driver_finance.driver_settlements ds
            ON ds.id = sl.settlement_id AND ds.operating_company_id = db.operating_company_id
         WHERE sl.source_driver_bill_id = db.id
           AND sl.operating_company_id = db.operating_company_id
           AND ${ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL}
        )`;
