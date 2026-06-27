-- [HOLD-FOR-JORGE — TIER 1] Load↔Advance: carry load_id DIRECTLY on the settlement deduction line
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** Tier-1 financial (driver_finance). BUILT-SOLO-AND-HELD;
-- runs on a Neon branch executed by Jorge/GUARD. Posts nothing, flips no flag.
--
-- WHY (Jorge LOCKED 2026-06-27): a load-linked cash advance's settlement deduction must carry load_id
-- DIRECTLY. The transitive trace (load → driver_advances.load_id → liability_id → deduction_schedule →
-- deduction) is NOT acceptable. This migration adds the direct column; the write path (one canonical
-- writer per table) stamps it at creation; a CI guard enforces it.
--
-- TABLE (the ONLY genuinely-missing column):
--   * driver_finance.driver_settlement_deductions — the pending recovery ledger
--     (deduction_type='cash_advance_repayment'); the lineage carrier from the advance.
--
-- NOTE on the actual settlement LINE table: the modern settlement engine writes the recovery line
-- (line_type='advance_recovery') into payroll.driver_settlement_line_items, which ALREADY has
-- load_id uuid NULL REFERENCES mdata.loads(id) (migration 0233). The only gap was the writer hardcoding
-- load_id=NULL on that line; the write path now stamps it from the pending deduction's load_id (added here).
-- (The older driver_finance.settlement_lines table is earnings-only and never carries advance_recovery, so
-- it needs no load_id for this purpose — GUARD's two table guesses were both off; confirmed by trace.)
--
-- BACKFILL: prod currently has 0 cash_advance_requests / 0 driver_advances (GUARD prod read 2026-06-27),
-- so there are no historical recovery rows to backfill — load_id stays NULL on any pre-existing rows
-- (genuinely unknown; documented). New rows are stamped forward by the write path. Idempotent + guarded.

DO $$
BEGIN
  -- ── driver_settlement_deductions.load_id ──────────────────────────────────────────────────────────
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD COLUMN IF NOT EXISTS load_id uuid;
    -- FK to mdata.loads(id) — add once, idempotently (no ADD CONSTRAINT IF NOT EXISTS in PG).
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'driver_settlement_deductions_load_id_fkey'
        AND conrelid = 'driver_finance.driver_settlement_deductions'::regclass
    ) THEN
      ALTER TABLE driver_finance.driver_settlement_deductions
        ADD CONSTRAINT driver_settlement_deductions_load_id_fkey
        FOREIGN KEY (load_id) REFERENCES mdata.loads(id);
    END IF;
    CREATE INDEX IF NOT EXISTS idx_driver_settlement_deductions_load_id
      ON driver_finance.driver_settlement_deductions (load_id) WHERE load_id IS NOT NULL;
  END IF;
END $$;

-- ── self-contained GRANTs (Standing Order #16) — table-level grant covers the new column ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ih35_app') THEN
    IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_settlement_deductions TO ih35_app;
    END IF;
  END IF;
END $$;
