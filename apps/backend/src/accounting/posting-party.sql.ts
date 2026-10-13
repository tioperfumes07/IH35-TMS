/**
 * LEAD 443.112 #3 — the party (payee) a posting belongs to, for READERS.
 *
 * The posting writer stamps entity_uuid / entity_type from the source document (resolvePostingSourceEntity, D6
 * 813b152e65). Ten USMCA expense postings (EXP-2026-00001..00005, 2026-10-07, both legs) were written before D6 with
 * no entity although their expense names its vendor. A posting's entity cannot be filled in place
 * (accounting.refuse_posting_fact_update refuses any entity change, LAW 363.3), so — exactly as 443.102 / #26579 did
 * for the settlement A/P legs — the attribution is RECORDED BY THE SOURCE DOCUMENT: when the posting carries no
 * entity, its expense's payee is the party, in the writer's own order (vendor, then driver, then customer).
 * The stored entity always wins; the fallback is same-company only.
 */
const EXPENSE_OF = (p: string) =>
  `FROM accounting.expenses pe
    WHERE ${p}.source_transaction_type = 'expense'
      AND pe.id::text = ${p}.source_transaction_id::text
      AND pe.operating_company_id = ${p}.operating_company_id`;

/** SQL expression: the posting's party uuid (text) — its stored entity, else its expense document's payee. */
export function postingPartyUuidSql(p = "p"): string {
  return `COALESCE(${p}.entity_uuid::text,
    (SELECT COALESCE(pe.vendor_uuid, pe.driver_uuid, pe.payee_customer_uuid)::text ${EXPENSE_OF(p)}))`;
}

/** SQL expression: the posting's party type — its stored entity_type, else the expense payee's kind. */
export function postingPartyTypeSql(p = "p"): string {
  return `CASE WHEN ${p}.entity_uuid IS NOT NULL THEN ${p}.entity_type
    ELSE (SELECT CASE WHEN pe.vendor_uuid IS NOT NULL THEN 'vendor'
                      WHEN pe.driver_uuid IS NOT NULL THEN 'driver'
                      WHEN pe.payee_customer_uuid IS NOT NULL THEN 'customer' END ${EXPENSE_OF(p)}) END`;
}

/** SQL expression: true when the party shown came from the source document, not the posting's own stamp. */
export function postingPartyFromDocumentSql(p = "p"): string {
  return `(${p}.entity_uuid IS NULL AND ${postingPartyUuidSql(p)} IS NOT NULL)`;
}
