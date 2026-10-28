/** A latch is standing only while its recorded, same-company journal entry has not been voided or reversed. */
export function standingLatchJePredicate(alias = "p"): string {
  return `EXISTS (
    SELECT 1 FROM accounting.journal_entries je
    WHERE je.id = ${alias}.journal_entry_id
      AND je.operating_company_id = ${alias}.operating_company_id
      AND je.voided_at IS NULL
      AND je.reversed_by_je_id IS NULL
  )`;
}

export const STANDING_LATCH_JE_PREDICATE = standingLatchJePredicate("p");
