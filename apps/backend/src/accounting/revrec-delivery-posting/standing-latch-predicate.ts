/**
 * ACCT-F66 — canonical SQL predicate for a revenue-recognition latch whose JE still stands.
 *
 * This leaf deliberately has no service imports. Both the posting engine and the revrec poster need
 * the predicate, while the poster itself creates journal entries through the posting stack. Keeping
 * the predicate in the poster made that dependency circular.
 */
export function standingLatchJePredicate(alias = "p"): string {
  return `EXISTS (
    SELECT 1 FROM accounting.journal_entries je
    WHERE je.id = ${alias}.journal_entry_id
      AND je.operating_company_id = ${alias}.operating_company_id
      AND je.voided_at IS NULL
      AND je.reversed_by_je_id IS NULL
  )`;
}

/** Default-alias form for the common `... postings p` shape. */
export const STANDING_LATCH_JE_PREDICATE = standingLatchJePredicate("p");
