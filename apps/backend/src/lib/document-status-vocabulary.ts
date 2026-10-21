/**
 * LEAD 443.219 G-VOCAB (10-21 23:35Z runtime audit) — ONE status vocabulary per document type, the live database's own:
 *   accounting.bills.status        free text — values written live: unpaid / partially_paid / paid / void (legacy aliases
 *                                  open / partial / voided still read); "unpaid" as a FILTER means "still owes money":
 *                                  unpaid + partially_paid (144 partially_paid A/P bills were hidden by the old open-only map);
 *   driver_finance.driver_bills    CHECK (status IN open, approved, paid, void, disputed) — "approved" is a closed-but-unpaid
 *                                  settlement's bill (173 live), never hidden by a filter that only knew open / paid / void.
 * The frontend's twin is packages/shared-types/src/document-status.ts (the backend cannot import shared-types at runtime);
 * scripts/verify-document-status-vocabulary.mjs fails when the two drift, and LIVE when a CHECK / live value is missing here.
 */
export const AP_BILL_STATUSES = ["unpaid", "partially_paid", "paid", "void"] as const;
export const AP_BILL_LEGACY_STATUSES = ["open", "partial", "voided"] as const;
/** A/P bills that still owe money — the "unpaid" filter. */
export const AP_BILL_OUTSTANDING_STATUSES = ["open", "unpaid", "partial", "partially_paid"] as const;

export const DRIVER_BILL_STATUSES = ["open", "approved", "paid", "void", "disputed"] as const;
/** Driver bills not yet paid out (and not void) — the "unpaid" filter for driver bills. */
export const DRIVER_BILL_OUTSTANDING_STATUSES = ["open", "approved", "disputed"] as const;

/** Load statuses that never carry a driver bill obligation (exits, voids, never-dispatched drafts). */
export const LOAD_STATUSES_WITHOUT_DRIVER_BILL = ["draft", "cancelled", "voided", "abandoned", "driver_walkoff", "driver_no_show"] as const;

export const sqlList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

/**
 * THE "load is missing its driver bill" predicate (exception queue count + list, the loads route's list + re-mint candidates):
 * a live load with a driver that is not an exit / void / draft and has NO live driver bill (a voided bill is not a bill —
 * `LEFT JOIN driver_bills … db.id IS NULL` used to count a void bill as present).
 */
export function loadMissingDriverBillWhereSql(alias = "l"): string {
  return `${alias}.soft_deleted_at IS NULL AND ${alias}.voided_at IS NULL
    AND ${alias}.status::text NOT IN (${sqlList(LOAD_STATUSES_WITHOUT_DRIVER_BILL)})
    AND (${alias}.assigned_primary_driver_id IS NOT NULL OR ${alias}.team_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills mdb
                     WHERE mdb.load_id = ${alias}.id AND mdb.voided_at IS NULL AND mdb.status <> 'void')`;
}
