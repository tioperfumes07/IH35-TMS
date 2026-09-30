// A-16 / A-21 (2026-09-30, owner): "has transactions" is ONE predicate, shared by
// customers/list.routes.ts and vendors/list.routes.ts, so the two lists' default filter can never
// silently disagree. Full derivation + live USMCA proof (76/1,249 customers, 34/623 vendors):
// docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md
//
// Ruling: a proforma invoice is a non-posting projection, never issued, never real (excluded). A
// VOIDED invoice/bill counts — void-not-delete means it was real, issued, then reversed; that is
// genuine history. A voided expense/fuel transaction does NOT count — in this system those voids
// are overwhelmingly same-session repair/reclassification voids (void+recreate to fix a wrong
// account), not a real vendor relationship that got cancelled; counting them would surface
// data-quality noise, not real vendor history.
//
// LANDMINE (not fixed here, flagged in the source doc): accounting.bills.vendor_uuid is `text`
// while mdata.vendors.id is `uuid` — the explicit `::text` cast below is required everywhere this
// join happens.

/** `idExpr` is the exact SQL expression for the candidate row's own id (e.g. "id" when the query's
 * FROM has no alias, or "c.id" when it does) — this function never introduces its own alias. */
export function customerHasTransactionsSql(idExpr: string): string {
  return `(
    EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.customer_id = ${idExpr} AND i.status != 'proforma')
    OR EXISTS (SELECT 1 FROM accounting.payments p WHERE p.customer_id = ${idExpr})
    OR EXISTS (SELECT 1 FROM accounting.credit_memos cm WHERE cm.customer_id = ${idExpr})
  )`;
}

/** Same idExpr contract as customerHasTransactionsSql. */
export function vendorHasTransactionsSql(idExpr: string): string {
  return `(
    EXISTS (SELECT 1 FROM accounting.bills b WHERE b.vendor_uuid = ${idExpr}::text AND b.status != 'void')
    OR EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.vendor_uuid = ${idExpr} AND e.voided_at IS NULL)
    OR EXISTS (SELECT 1 FROM fuel.fuel_transactions f WHERE f.vendor_id = ${idExpr} AND f.voided_at IS NULL)
    OR EXISTS (SELECT 1 FROM accounting.vendor_credits vc WHERE vc.vendor_id::text = ${idExpr}::text)
  )`;
}
