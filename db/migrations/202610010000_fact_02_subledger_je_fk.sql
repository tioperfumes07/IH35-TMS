-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] FACT-02 — factoring subledger journal_entry_id FKs.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies on a branch, then ledger-backfills. ***
--
-- LIVE finding (prod Neon, 2026-07-27): accounting.factoring_reserve_movements.journal_entry_id and
-- accounting.factoring_default_interest_accruals.journal_entry_id have NO FK (has_fk=false). Only
-- accounting.factoring_lifecycle_posting_keys.journal_entry_id is referentially enforced (composite
-- same-entity pattern in held 202607600000_factoring_balance_invoice_linkage).
--
-- FIX: ADD FK journal_entry_id -> accounting.journal_entries(id) ON DELETE RESTRICT plus same-entity
-- composite (operating_company_id, journal_entry_id) -> journal_entries (operating_company_id, id).
-- Fail-closed: count dangling / cross-entity mismatches and RAISE EXCEPTION — no DELETE/backfill.
-- Idempotent (pg_constraint guards). POSTS NOTHING.

BEGIN;

-- Composite-FK target spine (mirrors factoring_lifecycle_posting_keys / 202607600000).
DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL THEN
    RAISE NOTICE 'FACT-02: accounting.journal_entries absent — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_journal_entries_company_id'
      AND conrelid = 'accounting.journal_entries'::regclass
  ) THEN
    ALTER TABLE accounting.journal_entries
      ADD CONSTRAINT uq_journal_entries_company_id UNIQUE (operating_company_id, id);
  END IF;
END
$$;

-- ── factoring_reserve_movements ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dangling bigint;
  v_cross_entity bigint;
BEGIN
  IF to_regclass('accounting.factoring_reserve_movements') IS NULL THEN
    RAISE NOTICE 'FACT-02: factoring_reserve_movements absent — skip';
    RETURN;
  END IF;
  IF to_regclass('accounting.journal_entries') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM accounting.factoring_reserve_movements m
  WHERE m.journal_entry_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounting.journal_entries je WHERE je.id = m.journal_entry_id
    );

  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'FACT-02 ABORT: % dangling factoring_reserve_movements.journal_entry_id row(s) — fix before FK', v_dangling;
  END IF;

  SELECT COUNT(*) INTO v_cross_entity
  FROM accounting.factoring_reserve_movements m
  JOIN accounting.journal_entries je ON je.id = m.journal_entry_id
  WHERE m.journal_entry_id IS NOT NULL
    AND je.operating_company_id IS DISTINCT FROM m.operating_company_id;

  IF v_cross_entity > 0 THEN
    RAISE EXCEPTION 'FACT-02 ABORT: % factoring_reserve_movements row(s) with journal_entry_id in another operating company', v_cross_entity;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_reserve_movements_journal_entry_id_fkey'
      AND conrelid = 'accounting.factoring_reserve_movements'::regclass
  ) THEN
    ALTER TABLE accounting.factoring_reserve_movements
      ADD CONSTRAINT factoring_reserve_movements_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_reserve_movements_je_same_entity_fkey'
      AND conrelid = 'accounting.factoring_reserve_movements'::regclass
  ) THEN
    ALTER TABLE accounting.factoring_reserve_movements
      ADD CONSTRAINT factoring_reserve_movements_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, journal_entry_id)
      REFERENCES accounting.journal_entries (operating_company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_reserve_movements_journal_entry_id_fkey'
      AND conrelid = 'accounting.factoring_reserve_movements'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.factoring_reserve_movements
      VALIDATE CONSTRAINT factoring_reserve_movements_journal_entry_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_reserve_movements_je_same_entity_fkey'
      AND conrelid = 'accounting.factoring_reserve_movements'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.factoring_reserve_movements
      VALIDATE CONSTRAINT factoring_reserve_movements_je_same_entity_fkey;
  END IF;
END
$$;

-- ── factoring_default_interest_accruals ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dangling bigint;
  v_cross_entity bigint;
BEGIN
  IF to_regclass('accounting.factoring_default_interest_accruals') IS NULL THEN
    RAISE NOTICE 'FACT-02: factoring_default_interest_accruals absent — skip';
    RETURN;
  END IF;
  IF to_regclass('accounting.journal_entries') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM accounting.factoring_default_interest_accruals a
  WHERE a.journal_entry_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounting.journal_entries je WHERE je.id = a.journal_entry_id
    );

  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'FACT-02 ABORT: % dangling factoring_default_interest_accruals.journal_entry_id row(s) — fix before FK', v_dangling;
  END IF;

  SELECT COUNT(*) INTO v_cross_entity
  FROM accounting.factoring_default_interest_accruals a
  JOIN accounting.journal_entries je ON je.id = a.journal_entry_id
  WHERE a.journal_entry_id IS NOT NULL
    AND je.operating_company_id IS DISTINCT FROM a.operating_company_id;

  IF v_cross_entity > 0 THEN
    RAISE EXCEPTION 'FACT-02 ABORT: % factoring_default_interest_accruals row(s) with journal_entry_id in another operating company', v_cross_entity;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_default_interest_accruals_journal_entry_id_fkey'
      AND conrelid = 'accounting.factoring_default_interest_accruals'::regclass
  ) THEN
    ALTER TABLE accounting.factoring_default_interest_accruals
      ADD CONSTRAINT factoring_default_interest_accruals_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_default_interest_accruals_je_same_entity_fkey'
      AND conrelid = 'accounting.factoring_default_interest_accruals'::regclass
  ) THEN
    ALTER TABLE accounting.factoring_default_interest_accruals
      ADD CONSTRAINT factoring_default_interest_accruals_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, journal_entry_id)
      REFERENCES accounting.journal_entries (operating_company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_default_interest_accruals_journal_entry_id_fkey'
      AND conrelid = 'accounting.factoring_default_interest_accruals'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.factoring_default_interest_accruals
      VALIDATE CONSTRAINT factoring_default_interest_accruals_journal_entry_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_default_interest_accruals_je_same_entity_fkey'
      AND conrelid = 'accounting.factoring_default_interest_accruals'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.factoring_default_interest_accruals
      VALIDATE CONSTRAINT factoring_default_interest_accruals_je_same_entity_fkey;
  END IF;
END
$$;

COMMIT;
