-- ROUND 274 — voided_at ↔ status CHECKs for remaining money tables + liability drift repair.
-- Factoring already has AUTH-132 / 202614570000+202614590000 — do NOT duplicate.
--
-- MEASURED live USMCA 2026-09-30 (bypass_rls=lucia):
--   driver_finance.driver_liabilities: 2 rows voided_at set, status='reversed' (ids
--   54548c0a…, 105cbd4f…, ROUND 153 item 8). Canonical void path (liabilities.routes +
--   executeVoidCancel) writes status='voided'. Repair those 2 → 'voided' (status_before_void
--   keeps 'reversed' when null). GL untouched — subledger only.
--   expenses / invoices / bills / driver_bills / settlements / checks: drift 0.
--   Plaid orphan match 2d1f3f73… already on survivor 52c51c10… (item 53) — re-point is idempotent.
--
-- CHECK shape (R274): voided_at IS NULL OR status = <table void status>.
-- NOT VALID first, then VALIDATE only where live USMCA (and frozen entities) are clean.
-- bank_transactions.status is categorization (pending_categorization etc.) — NOT a void status;
-- no CHECK of this shape applies there. Tables without a status column are skipped.

BEGIN;

-- 1) Drift repair — driver_liabilities (2 rows). Preserve prior status in status_before_void.
UPDATE driver_finance.driver_liabilities
   SET status_before_void = COALESCE(status_before_void, status),
       status = 'voided'
 WHERE voided_at IS NOT NULL
   AND status IS DISTINCT FROM 'voided';

-- 2) CHECKs — idempotent ADD … NOT VALID, then VALIDATE when safe.
DO $$
BEGIN
  -- expenses
  IF to_regclass('accounting.expenses') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'expenses_status_matches_voided_at'
          AND conrelid = 'accounting.expenses'::regclass
     ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'void') NOT VALID;
  END IF;

  -- driver_liabilities
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'driver_liabilities_status_matches_voided_at'
          AND conrelid = 'driver_finance.driver_liabilities'::regclass
     ) THEN
    ALTER TABLE driver_finance.driver_liabilities
      ADD CONSTRAINT driver_liabilities_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'voided') NOT VALID;
  END IF;

  -- driver_settlements (void/cancel status = cancelled)
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'driver_settlements_status_matches_voided_at'
          AND conrelid = 'driver_finance.driver_settlements'::regclass
     ) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'cancelled') NOT VALID;
  END IF;

  -- check_number_registry
  IF to_regclass('banking.check_number_registry') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'check_number_registry_status_matches_voided_at'
          AND conrelid = 'banking.check_number_registry'::regclass
     ) THEN
    ALTER TABLE banking.check_number_registry
      ADD CONSTRAINT check_number_registry_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'voided') NOT VALID;
  END IF;

  -- work_orders (void path stamps voided_at; cancel path uses status='cancelled')
  IF to_regclass('maintenance.work_orders') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'work_orders_status_matches_voided_at'
          AND conrelid = 'maintenance.work_orders'::regclass
     ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_status_matches_voided_at
      CHECK (voided_at IS NULL OR status = 'cancelled') NOT VALID;
  END IF;
END $$;

-- VALIDATE — live measured clean after step 1 (USMCA). Frozen TRANSP/TRK rows: if VALIDATE
-- fails on a frozen entity, leave NOT VALID (convalidated=false) and continue — never write
-- frozen entities. Each VALIDATE is independent.
DO $$
BEGIN
  BEGIN
    ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_status_matches_voided_at;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'expenses_status_matches_voided_at left NOT VALID: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE driver_finance.driver_liabilities VALIDATE CONSTRAINT driver_liabilities_status_matches_voided_at;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'driver_liabilities_status_matches_voided_at left NOT VALID: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE driver_finance.driver_settlements VALIDATE CONSTRAINT driver_settlements_status_matches_voided_at;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'driver_settlements_status_matches_voided_at left NOT VALID: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE banking.check_number_registry VALIDATE CONSTRAINT check_number_registry_status_matches_voided_at;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'check_number_registry_status_matches_voided_at left NOT VALID: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE maintenance.work_orders VALIDATE CONSTRAINT work_orders_status_matches_voided_at;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'work_orders_status_matches_voided_at left NOT VALID: %', SQLERRM;
  END;
END $$;

-- 3) Reinstatement columns on check_number_registry (missing; other R274 money tables already have them).
ALTER TABLE banking.check_number_registry
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid;

-- 4) Plaid merge item 53 — idempotent re-point of known orphan match to survivor.
-- Live measured 2026-09-30: already on 52c51c10…; no-op when already correct.
UPDATE banking.reconciliation_matches rm
   SET bank_transaction_id = '52c51c10-bd54-44bf-b734-f79a1811cefd'::uuid,
       updated_at = now()
 WHERE rm.id = '2d1f3f73-52c7-4249-944a-3e9ceec1ee8c'::uuid
   AND rm.bank_transaction_id IS DISTINCT FROM '52c51c10-bd54-44bf-b734-f79a1811cefd'::uuid
   AND EXISTS (
     SELECT 1 FROM banking.bank_transactions bt
      WHERE bt.id = '52c51c10-bd54-44bf-b734-f79a1811cefd'::uuid
   );

COMMIT;
