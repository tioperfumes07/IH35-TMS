/**
 * OPERATOR WO VISIBILITY — shared definition of which maintenance.work_orders belong on human-facing lists.
 *
 * maintenance.work_orders has no is_sample_data column. Demo/test fixtures are hidden by display_id
 * prefix (DEMO-/TEST-) while rows stay in the table (void-not-delete / NO-SEAT law). Voided WOs are
 * excluded separately via openWorkOrderPredicate.
 */

/** SQL fragments excluding seed/demo display_ids from operator list queries. */
export function excludeOperatorWorkOrderDisplayIdSql(alias = "w"): string[] {
  const d = `COALESCE(${alias}.display_id, '')`;
  return [`${d} NOT ILIKE 'DEMO-%'`, `${d} NOT ILIKE 'TEST-%'`];
}

/** Single AND-joined predicate for inline WHERE clauses. */
export function operatorWorkOrderListSql(alias = "w"): string {
  return excludeOperatorWorkOrderDisplayIdSql(alias).join(" AND ");
}
