-- EXP-POSTED-NO-JE-01 (owner-verified live 2026-09-01). Three confirmed rows presented a
-- posted-ish state with zero postings: accounting.expenses 8a1b3d84-2cd5-4099-8c98-4076cda163c7
-- ($75.00, status='posted', posting_status='posted', journal_entry_id NULL) and accounting.bills
-- BILL-2026-00018 ($750.00) + BILL-2026-00019 ($300.00), both zero journal_entry_postings rows.
-- All three failed void with "No posted batch found to reverse" -- correctly, since nothing was
-- ever posted. The records were wrong, not the void.
--
-- SCHEMA CHECK BEFORE BUILDING (never-guess law): accounting.bills carries NEITHER
-- posting_status NOR journal_entry_id at all -- confirmed live via information_schema, not
-- assumed. A bill's GL linkage is entirely via the source-tag lookup
-- (journal_entry_postings.source_transaction_type='bill' AND source_transaction_id=<bill.id>),
-- never a direct column on the bill row. So the CHECK-constraint half of this fix (owner:
-- "posting_status cannot be 'posted' without a journal_entry_id... that combination should be
-- impossible") only APPLIES to accounting.expenses, which does carry both columns. For bills,
-- the actual defect was that voidBillInClientTx called the reversal engine UNCONDITIONALLY, with
-- no gate at all on whether a posted batch existed -- already fixed separately (bills.service.ts,
-- same session) by pre-checking journal_entry_postings before attempting a reversal, mirroring
-- the existing ACCT-F327 pattern already shipped for bill_payments. There is no bills-side schema
-- gap to add a constraint for; the gap was purely in the void code path's assumption.
--
-- This migration adds an ADDITIVE CHECK (NOT VALID) to accounting.expenses only: enforced on
-- every FUTURE INSERT/UPDATE immediately, does not touch or block on the one already-known bad
-- row (fixed separately via the corrected void path -- a status change + audit entry, no
-- fabricated reversal). The stronger "at least one balanced posting" half of the owner's rule is
-- a cross-table check a plain CHECK constraint cannot express (would need a trigger querying
-- journal_entry_postings) -- flagged as a follow-on, not built here.
--
-- Idempotent: guarded by pg_constraint existence check, safe to re-run. NOT VALID means Postgres
-- does not scan/validate existing rows at ADD time (would otherwise fail immediately on the one
-- known-bad row) -- VALIDATE CONSTRAINT is a separate, later step once that row is corrected.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_posted_requires_je' AND conrelid = 'accounting.expenses'::regclass
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_posted_requires_je
      CHECK (posting_status <> 'posted' OR journal_entry_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

COMMIT;
