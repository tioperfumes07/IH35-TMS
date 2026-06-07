-- TIER 1 TRUST — Block 5 (GAP-DOUBLE-ENTRY-DB-ENFORCEMENT) — production remediation
--
-- WHY THIS MIGRATION EXISTS
-- The balance-enforcement objects were originally created in
-- 0092_p5_d4_manual_journal_entries.sql:
--   - function accounting.ensure_journal_entry_balanced()
--   - CONSTRAINT TRIGGER trg_check_journal_entry_balanced ON
--     accounting.journal_entry_postings (DEFERRABLE INITIALLY DEFERRED)
--
-- During TIER1-T5 verification (2026-06-07) the live production branch was found
-- to have the FUNCTION present but the TRIGGER MISSING (zero user triggers on
-- accounting.journal_entry_postings), even though 0092 is recorded as applied.
-- The orphaned function meant double-entry was NOT enforced at the DB level in
-- production. This migration re-attaches the constraint trigger so the invariant
-- (SUM(debit_cents) = SUM(credit_cents) per journal entry) is enforced again.
--
-- Idempotent and safe to run on every environment: DROP IF EXISTS + CREATE.
-- The referenced function already exists and is already granted; no GRANT needed
-- (a trigger runs in the security context of the function, which ih35_app may
-- already invoke via its INSERT/UPDATE/DELETE on journal_entry_postings).

BEGIN;

DROP TRIGGER IF EXISTS trg_check_journal_entry_balanced ON accounting.journal_entry_postings;

CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balanced
  AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.ensure_journal_entry_balanced();

COMMIT;
