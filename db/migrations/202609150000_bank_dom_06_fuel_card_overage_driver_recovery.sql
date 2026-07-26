-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] BANK-DOM-06 — fuel-card OVERAGE -> driver receivable -> settlement.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. DO NOT flip
--     FUEL_CARD_OVERAGE_RECOVERY_ENABLED. The flag is registered DEFAULT OFF and stays OFF until the
--     owner designates the per-company limit and authorizes cutover. Run ONLY on a Neon branch by
--     Jorge's hand, then ledger-backfill. ***
--
-- FINDING (FOR-CURSOR 4 · BANK-DOM-06): a fuel-card purchase that exceeds the company's authorized
-- limit — or a NON-FUEL item bought on the fleet card — is paid in full by the company and then has
-- NO path to be recovered from the driver. `overage` appears nowhere in the codebase: no policy, no
-- receivable, no settlement deduction. The company silently eats every over-limit / personal charge.
--
-- NOTE ON THE OTHER HALF OF THE BLOCK: the block text also claims fuel expense->GL is "candidate-only
-- (never posts)". That is STALE as of commit 734b1d8bf8 ("wire fuel GL poster after Relay/CSV
-- ingest"): flushFuelGlPostsAfterCommit is called by BOTH writers today
-- (fuel-transaction-import.routes.ts:115, relay-fuel-ingest.cron.ts:259+404). No re-fix is shipped
-- for an already-fixed path; this migration addresses the genuinely-absent overage half only.
--
-- NO NEW GL MATH. The recovery reuses the EXISTING canonical hop that BLOCK-6b already uses for a
-- fine the company paid on a driver's behalf: createSettlementDeduction(...) writes
-- driver_finance.driver_settlement_deductions (the driver receivable subledger, carry-forward via
-- remaining_balance_cents), and the EXISTING FIN-18 settlement poster credits the shared
-- `{deduction_type}_recovery` role account when the settlement posts. This migration is scaffolding
-- only: policy + linkage + flag. It writes NO debit, NO credit, NO balance.
--
-- ROLE: deduction_type 'fuel' resolves through bucketRecoveryRoleKey() to the EXISTING
-- `fuel_advance_recovery` role (aliased in the same PR, mirroring the existing
-- cash_advance_repayment -> advance_recovery alias). NO new CoA role is added and the role CHECK
-- constraints are deliberately NOT touched.
--
-- FRESH-DB SAFE / IDEMPOTENT / additive-only / void-not-delete. Grants re-asserted (0065 pattern).

BEGIN;

-- §1 — Owner-designated overage policy. NO ROWS = NO LIMIT = NO OVERAGE = strict no-op. -------------
-- Nothing here infers a limit: the owner sets one in-app per operating company, optionally overridden
-- per driver. This is the ONLY source of "what counts as an overage" — the code never guesses.
DO $$
BEGIN
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'fuel_card_overage_policies: org.companies absent — skipping (clean no-op)';
  ELSE
  CREATE TABLE IF NOT EXISTS fuel.fuel_card_overage_policies (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
    -- NULL = the company-wide default policy; non-NULL = a per-driver override that wins.
    driver_id                     uuid NULL,
    -- Spend above this on a SINGLE card transaction is recoverable from the driver.
    -- NULL = no dollar limit (the owner has not designated one) -> no overage from this rule.
    per_transaction_limit_cents   bigint NULL CHECK (per_transaction_limit_cents > 0),
    -- When true, a NON-FUEL purchase on the fleet card (fuel_type='other' — merchandise, food,
    -- personal items) is recoverable IN FULL. Default false: recover nothing until the owner opts in.
    recover_non_fuel_purchases    boolean NOT NULL DEFAULT false,
    effective_from                date NOT NULL DEFAULT CURRENT_DATE,
    notes                         text,
    -- void-not-delete (Rule 04)
    is_active                     boolean NOT NULL DEFAULT true,
    voided_at                     timestamptz,
    voided_by_user_id             uuid,
    void_reason                   text,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by_user_id            uuid
  );

  IF to_regclass('mdata.drivers') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fuel_card_overage_policies_driver') THEN
    ALTER TABLE fuel.fuel_card_overage_policies
      ADD CONSTRAINT fk_fuel_card_overage_policies_driver
      FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
  END IF;

  -- Exactly one ACTIVE company-default, and one ACTIVE override per driver.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_card_overage_policy_company_default
    ON fuel.fuel_card_overage_policies (operating_company_id)
    WHERE is_active AND driver_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_card_overage_policy_driver
    ON fuel.fuel_card_overage_policies (operating_company_id, driver_id)
    WHERE is_active AND driver_id IS NOT NULL;

  ALTER TABLE fuel.fuel_card_overage_policies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE fuel.fuel_card_overage_policies FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS fuel_card_overage_policies_select ON fuel.fuel_card_overage_policies;
  DROP POLICY IF EXISTS fuel_card_overage_policies_write  ON fuel.fuel_card_overage_policies;
  CREATE POLICY fuel_card_overage_policies_select ON fuel.fuel_card_overage_policies FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY fuel_card_overage_policies_write ON fuel.fuel_card_overage_policies FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON fuel.fuel_card_overage_policies TO ih35_app;
  REVOKE DELETE ON fuel.fuel_card_overage_policies FROM ih35_app;
  END IF;
END
$$;

-- §2 — FORWARD provenance: the deduction points back at the fuel transaction that created it. -------
-- Mirrors BLOCK-6b's source_bank_transaction_id (migration 202607070100) exactly.
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD COLUMN IF NOT EXISTS source_fuel_transaction_id uuid NULL;

    IF to_regclass('fuel.fuel_transactions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'driver_settlement_deductions_source_fuel_txn_fkey'
           AND conrelid = 'driver_finance.driver_settlement_deductions'::regclass
       ) THEN
      ALTER TABLE driver_finance.driver_settlement_deductions
        ADD CONSTRAINT driver_settlement_deductions_source_fuel_txn_fkey
        FOREIGN KEY (source_fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
    END IF;

    -- HARD idempotency: one recovery deduction per fuel transaction. A re-run of the import (or a
    -- double flush) cannot double-charge the driver — the second INSERT violates this index.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlement_deductions_source_fuel_txn
      ON driver_finance.driver_settlement_deductions (operating_company_id, source_fuel_transaction_id)
      WHERE source_fuel_transaction_id IS NOT NULL;
  END IF;
END
$$;

-- §3 — REVERSE drill-through: the fuel transaction points at the deduction it produced (Rule 14). ---
DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    ALTER TABLE fuel.fuel_transactions
      ADD COLUMN IF NOT EXISTS overage_deduction_id uuid NULL;
    -- Denormalised for the register/detail read path; the deduction row remains authoritative.
    ALTER TABLE fuel.fuel_transactions
      ADD COLUMN IF NOT EXISTS overage_recovered_cents bigint NULL
      CHECK (overage_recovered_cents IS NULL OR overage_recovered_cents > 0);

    IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_transactions_overage_deduction_fkey'
           AND conrelid = 'fuel.fuel_transactions'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_transactions
        ADD CONSTRAINT fuel_transactions_overage_deduction_fkey
        FOREIGN KEY (overage_deduction_id)
        REFERENCES driver_finance.driver_settlement_deductions(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_fuel_txn_overage_deduction
      ON fuel.fuel_transactions (overage_deduction_id)
      WHERE overage_deduction_id IS NOT NULL;
  END IF;
END
$$;

-- §4 — Feature flag DEFAULT OFF -----------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'FUEL_CARD_OVERAGE_RECOVERY_ENABLED',
      'BANK-DOM-06: when an imported fuel-card transaction exceeds the owner-designated '
        || 'fuel.fuel_card_overage_policies limit (or is a non-fuel purchase and the policy opts in), '
        || 'auto-create a recoverable driver_finance.driver_settlement_deductions row '
        || '(deduction_type=fuel -> fuel_advance_recovery) that flows into the FIN-18 settlement '
        || 'poster. Per-entity override only. OFF until the owner sets a policy and authorizes cutover.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

-- §5 — Re-assert grants idempotently (0065 pattern) so runtime never 500s on the new columns -------
DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON fuel.fuel_transactions TO ih35_app;
  END IF;
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_settlement_deductions TO ih35_app;
  END IF;
END
$$;

COMMIT;

-- Verification (read-only; harmless on re-run) ------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'fuel' AND table_name = 'fuel_card_overage_policies') AS policy_table,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'driver_finance' AND table_name = 'driver_settlement_deductions'
       AND column_name = 'source_fuel_transaction_id')                          AS deduction_fwd_fk,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions'
       AND column_name IN ('overage_deduction_id','overage_recovered_cents'))   AS fuel_reverse_cols,
  (SELECT COUNT(*) FROM lib.feature_flags
     WHERE flag_key = 'FUEL_CARD_OVERAGE_RECOVERY_ENABLED'
       AND default_enabled = false)                                             AS flag_seeded_off,
  (SELECT COUNT(*) FROM fuel.fuel_card_overage_policies)                        AS policies_seeded_zero;
