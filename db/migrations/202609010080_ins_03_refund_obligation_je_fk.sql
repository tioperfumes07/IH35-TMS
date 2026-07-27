-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] INS-03 — refund_obligation.journal_entry_id FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: money link to accounting.journal_entries was convention-only (no FK) — can dangle.
-- Fix: ADD FK ON DELETE RESTRICT after proving 0 dangling ids. Void-not-delete on JEs.
-- Cursor band 20260901xxxx. Idempotent.

BEGIN;

DO $$
DECLARE
  v_dangling bigint;
BEGIN
  IF to_regclass('insurance.refund_obligation') IS NULL THEN
    RAISE NOTICE 'INS-03: insurance.refund_obligation absent — skip';
    RETURN;
  END IF;
  IF to_regclass('accounting.journal_entries') IS NULL THEN
    RAISE NOTICE 'INS-03: accounting.journal_entries absent — skip';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'refund_obligation_journal_entry_id_fkey'
      AND conrelid = 'insurance.refund_obligation'::regclass
  ) THEN
    RAISE NOTICE 'INS-03: refund_obligation_journal_entry_id_fkey already present — skip';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM insurance.refund_obligation r
  WHERE r.journal_entry_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounting.journal_entries je WHERE je.id = r.journal_entry_id
    );

  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'INS-03 ABORT: % dangling refund_obligation.journal_entry_id row(s) — surface and fix before FK', v_dangling;
  END IF;

  ALTER TABLE insurance.refund_obligation
    ADD CONSTRAINT refund_obligation_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id)
    ON DELETE RESTRICT;
END
$$;

COMMIT;
