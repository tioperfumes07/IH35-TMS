-- 202607180000_settle_deduction_fk_repoint_to_payroll.sql
-- [HOLD-FOR-JORGE — TIER 1 / MIGRATION] Repoint applied_to_settlement_id FK to the LIVE settlement table.
--
-- BUG (P1-SETTLE-FK, verified on prod br-fancy-credit-akjnd07a 2026-07-10):
--   driver_finance.driver_settlement_deductions.applied_to_settlement_id carries FK
--   driver_settlement_deductions_applied_to_settlement_fkey -> driver_finance.driver_settlements
--   (ON DELETE/UPDATE NO ACTION). BUT the LIVE settlement engine
--   payroll/driver-settlement.service.ts postSettlement() writes a payroll.driver_settlements id into
--   that column (the capped-recovery deduction-application UPDATE). A payroll id does not exist in
--   driver_finance.driver_settlements -> FK violation -> the FIRST real settlement with a pending advance
--   rolls back the entire post. Latent today (both tables 0 rows on prod).
--
-- FIX: repoint the FK to payroll.driver_settlements (the table the live code actually writes), preserving
--   NO ACTION semantics. Idempotent + fresh-DB-safe; 0 rows so no existing data can violate it.
--   Additive-only: no column dropped, no data touched. Does NOT prejudge the settlement-engine
--   consolidation (Batch-1 #07 design) — it only aligns the FK to the live write path so it stops crashing.

BEGIN;

DO $mig$
DECLARE
  wrong_fk text;
BEGIN
  -- Drop the FK only while it still targets the dormant driver_finance.driver_settlements table.
  SELECT tc.constraint_name INTO wrong_fk
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'driver_finance' AND tc.table_name = 'driver_settlement_deductions'
    AND kcu.column_name = 'applied_to_settlement_id'
    AND ccu.table_schema = 'driver_finance' AND ccu.table_name = 'driver_settlements'
  LIMIT 1;

  IF wrong_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE driver_finance.driver_settlement_deductions DROP CONSTRAINT %I', wrong_fk);
  END IF;

  -- Add the correct FK -> payroll.driver_settlements (NO ACTION) if it is not already present.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'driver_finance' AND tc.table_name = 'driver_settlement_deductions'
      AND kcu.column_name = 'applied_to_settlement_id'
      AND ccu.table_schema = 'payroll' AND ccu.table_name = 'driver_settlements'
  ) THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT driver_settlement_deductions_applied_to_settlement_fkey
      FOREIGN KEY (applied_to_settlement_id)
      REFERENCES payroll.driver_settlements(id);
  END IF;
END
$mig$;

COMMIT;

-- ROLLBACK (owner-run only; reverts to the dormant-engine FK):
-- ALTER TABLE driver_finance.driver_settlement_deductions
--   DROP CONSTRAINT driver_settlement_deductions_applied_to_settlement_fkey;
-- ALTER TABLE driver_finance.driver_settlement_deductions
--   ADD CONSTRAINT driver_settlement_deductions_applied_to_settlement_fkey
--   FOREIGN KEY (applied_to_settlement_id) REFERENCES driver_finance.driver_settlements(id);
