-- [HOLD-FOR-JORGE — TIER 1] BLOCK-6 — Driver dimension on bank categorize + loan-to-driver posting.
-- PROTECTED (ALTER of an existing financial-adjacent table) → the PR will need JORGE-APPROVED, but it
-- still does NOT merge (HOLD). Runs on a Neon branch under GUARD/Jorge before prod.
--
-- WHY: The bank categorize panel needs a Driver field so a transaction that belongs to a driver (e.g. a
-- fine the company paid on the driver's behalf) can be TAGGED to that driver. The account chosen decides
-- treatment (posting is a separate, flag-gated step in bank-driver-advance.service.ts): Driver + a
-- Driver-Advance / Loan-to-Driver account (Other Current Asset) → a recoverable advance receivable;
-- Driver + an expense account → analytics-only tag, stays a company expense (NO receivable).
--
-- This migration is purely additive + idempotent:
--   1) adds a nullable driver TAG column to banking.bank_transactions (FK to the entity's driver set),
--   2) seeds the OFF-by-default feature flag BANK_DRIVER_ADVANCE_ENABLED so it appears in the admin UI.
-- No RLS policy change is needed: banking.bank_transactions already RLS-scopes by operating_company_id and
-- a new nullable column inherits the table's grants + policies. No opening JE, no GL rows here.

BEGIN;

-- 1) Driver TAG column (nullable, per-entity via the table's existing operating_company_id RLS) ----------
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_driver_id uuid NULL REFERENCES mdata.drivers(id);

-- Partial index for driver-scoped lookups (only the tagged rows).
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_driver
  ON banking.bank_transactions (operating_company_id, categorization_driver_id)
  WHERE categorization_driver_id IS NOT NULL;

-- 2) Seed the OFF-by-default flag (idempotent; guarded on lib.feature_flags existing) --------------------
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'BANK_DRIVER_ADVANCE_ENABLED',
      'BLOCK-6: post a driver loan/advance receivable when a bank transaction is categorized to a '
        || 'Driver + a Driver-Advance (Other Current Asset) account. OFF until GUARD-verified + owner flip.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'banking'
    AND table_name = 'bank_transactions'
    AND column_name = 'categorization_driver_id'
) AS bank_transactions_categorization_driver_id_column;
