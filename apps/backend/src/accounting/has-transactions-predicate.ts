// A-16 / A-21 (2026-09-30, owner): "has transactions" is ONE predicate, shared by
// customers/list.routes.ts and vendors/list.routes.ts, so the two lists' default filter can never
// silently disagree. Full derivation + live USMCA proof:
// docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md
//
// CORRECTED 2026-09-30 (Lead ruling r294d, owner overrule): the original A-16 analysis counted a
// VOIDED invoice/bill as "has transactions" (void-not-delete = genuine history). The owner
// overruled that specific edge case: "by transactions i mean real money transactions. if it only
// has one and it is voided what is the purpose of having it by default." Ruling: real money
// movement only, voided never counts. A proforma invoice is still excluded (a non-posting
// projection, never issued, never real). Live USMCA proof after the correction: 65/1,249 customers
// (was 76 when void counted), 34/623 vendors (UNCHANGED — bills already excluded void before this
// correction, so the vendor side was never affected by this edge case).
//
// LANDMINE (not fixed here, flagged in the source doc): accounting.bills.vendor_uuid is `text`
// while mdata.vendors.id is `uuid` — the explicit `::text` cast below is required everywhere this
// join happens.

/** `idExpr` is the exact SQL expression for the candidate row's own id (e.g. "id" when the query's
 * FROM has no alias, or "c.id" when it does) — this function never introduces its own alias. */
export function customerHasTransactionsSql(idExpr: string): string {
  return `(
    EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.customer_id = ${idExpr} AND i.status NOT IN ('proforma', 'void'))
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
