-- [HOLD-FOR-JORGE — TIER 1] BLOCK-6b — Unit + Trip(Load) dimensions on bank categorize, and the
-- driver auto-deduction (recover-from-driver) linkage from a bank-categorized expense.
--
-- FINANCIAL CLUSTER (touches driver_finance + banking, seeds a posting-adjacent flag) → this PR needs
-- JORGE-APPROVED and still does NOT self-merge (HOLD). Runs on a Neon branch under GUARD/Jorge first.
--
-- WHY: BLOCK-6 (migration 202607010010) added ONLY a driver TAG to bank categorize. The owner requires the
-- full picture: when categorizing a bank transaction you can assign a DRIVER + a UNIT (truck) + a TRIP
-- (load), and — when a paid expense BELONGS to a driver (e.g. a FINE the company paid on the driver's
-- behalf) — auto-create a RECOVERABLE driver deduction (a receivable the company recovers from that
-- driver's settlement). This migration is the schema half; the wiring (behind an OFF flag) lives in
-- apps/backend/src/banking/bank-driver-expense-deduction.service.ts and reuses the EXISTING deduction +
-- bucket + FIN-18 settlement-poster infra (no new GL math).
--
-- Purely additive + idempotent:
--   1) banking.bank_transactions: unit TAG, load(trip) TAG, recover-from-driver flag + target bucket type,
--      and a reverse link to the deduction that was created (categorization_deduction_id).
--   2) driver_finance.driver_settlement_deductions: source_bank_transaction_id (forward provenance to the
--      originating bank transaction — the reverse of categorization_deduction_id).
--   3) seed the OFF-by-default flag BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED.
-- No RLS policy change: both tables already RLS-scope by operating_company_id; new nullable columns inherit
-- the table's grants + policies. No opening JE, no GL rows here. Grants re-asserted idempotently (0065
-- pattern) so a runtime ih35_app read/write of the new columns can never 500 on a missing grant.

BEGIN;

-- 1) banking.bank_transactions — additive dimension + recover flags + reverse deduction link --------------
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_unit_id uuid NULL REFERENCES mdata.units(id);
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_load_id uuid NULL REFERENCES mdata.loads(id);
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_recover_from_driver boolean NOT NULL DEFAULT false;
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_recover_deduction_type text NULL;
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_deduction_id uuid NULL
  REFERENCES driver_finance.driver_settlement_deductions(id);
-- Catalog-linkage (QBO parity): an ITEM line links to the Products & Services catalog (catalogs.items),
-- DISTINCT from the Category line which links to the Chart of Accounts (already persisted via
-- coa_account_id / categorization_gl_account_id). Payee → categorization_vendor_id and Customer →
-- categorization_customer_id already exist on this table; this adds the missing Item linkage.
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_item_id uuid NULL REFERENCES catalogs.items(id);

-- Partial indexes for the tagged rows only (dimension lookups + reverse drill-through).
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_unit
  ON banking.bank_transactions (operating_company_id, categorization_unit_id)
  WHERE categorization_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_load
  ON banking.bank_transactions (operating_company_id, categorization_load_id)
  WHERE categorization_load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_deduction
  ON banking.bank_transactions (categorization_deduction_id)
  WHERE categorization_deduction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_item
  ON banking.bank_transactions (operating_company_id, categorization_item_id)
  WHERE categorization_item_id IS NOT NULL;

-- 2) driver_finance.driver_settlement_deductions — forward provenance to the source bank transaction -------
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD COLUMN IF NOT EXISTS source_bank_transaction_id uuid NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'driver_settlement_deductions_source_bank_txn_fkey'
        AND conrelid = 'driver_finance.driver_settlement_deductions'::regclass
    ) THEN
      ALTER TABLE driver_finance.driver_settlement_deductions
        ADD CONSTRAINT driver_settlement_deductions_source_bank_txn_fkey
        FOREIGN KEY (source_bank_transaction_id) REFERENCES banking.bank_transactions(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_driver_settlement_deductions_source_bank_txn
      ON driver_finance.driver_settlement_deductions (source_bank_transaction_id)
      WHERE source_bank_transaction_id IS NOT NULL;
  END IF;
END $$;

-- 3) Seed the OFF-by-default flag (idempotent; guarded on lib.feature_flags existing) --------------------
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED',
      'BLOCK-6b: when a bank transaction is categorized to a Driver + flagged recover-from-driver (e.g. a '
        || 'fine the company paid on the driver''s behalf), auto-create a recoverable driver_settlement_'
        || 'deductions row (bucket-charged, consent-gated) that flows into the FIN-18 settlement poster. '
        || 'OFF until GUARD-verified + owner flip.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

-- 4) Re-assert grants idempotently (0065 pattern) so runtime ih35_app never 500s on the new columns -------
DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON banking.bank_transactions TO ih35_app;
  END IF;
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_settlement_deductions TO ih35_app;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
       AND column_name IN ('categorization_unit_id','categorization_load_id',
                           'categorization_recover_from_driver','categorization_recover_deduction_type',
                           'categorization_deduction_id','categorization_item_id')) AS bank_tx_new_columns_count,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'driver_finance' AND table_name = 'driver_settlement_deductions'
       AND column_name = 'source_bank_transaction_id') AS deduction_source_bank_txn_column,
  (SELECT COUNT(*) FROM lib.feature_flags
     WHERE flag_key = 'BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED' AND default_enabled = false) AS flag_seeded_off;
