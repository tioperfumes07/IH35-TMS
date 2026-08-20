-- FINDING: ACCT-F5629 — accounting.expenses had no legal_matter_id column, so a legal cost paid as a
-- plain company expense (filing fee, court reporter, expert-witness invoice via company card) rather
-- than a vendor bill was invisible to listLegalMatterLinkedCosts, which silently summed
-- accounting.bills only. Mirrors 202612130000's own accounting.bills.legal_matter_id addition exactly
-- — same nullable/pointer-only shape, same reasoning: the overwhelming majority of expenses are not
-- litigation-related, so forcing a value would either block ordinary expense entry or invite a junk
-- default. This does not change posting: the existing expense poster is unchanged, this is a pointer
-- FROM accounting TO the matter, same separation-of-duties as the bills column (Legal stores
-- documents/consents; Accounting posts).
--
-- Additive · idempotent · no posting, no flag, no money moves.

BEGIN;

-- Inline REFERENCES so a fresh database can never get the column without the constraint
-- (verify:orphan-fk-inventory).
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS legal_matter_id uuid REFERENCES legal.matters(id);

-- Convergence for a database where the column already exists WITHOUT the constraint: ADD COLUMN
-- IF NOT EXISTS is a no-op there, so the inline REFERENCES above would never fire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'accounting'
      AND t.relname = 'expenses'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%legal_matter_id%'
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_legal_matter_fk FOREIGN KEY (legal_matter_id) REFERENCES legal.matters(id);
  END IF;
END$$;

COMMENT ON COLUMN accounting.expenses.legal_matter_id IS
  'The legal matter this expense was incurred on (filing fees, court reporter, expert-witness invoices paid via company card rather than a vendor bill). Nullable: most expenses are not litigation-related. Mirrors accounting.bills.legal_matter_id (202612130000) so listLegalMatterLinkedCosts can sum both sources — accounting.bills alone silently understated matter cost for any legal spend that went through a plain expense instead of a bill.';

-- Reverse lookup: "every cost on this matter" must not table-scan accounting.expenses.
CREATE INDEX IF NOT EXISTS idx_expenses_legal_matter_id
  ON accounting.expenses (legal_matter_id)
  WHERE legal_matter_id IS NOT NULL;

COMMIT;
