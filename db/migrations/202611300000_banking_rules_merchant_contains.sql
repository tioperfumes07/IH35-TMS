-- Additive: merchant/payee condition on accounting.banking_rules + TRANSP seeds
-- LOVE'S TIRE CARE → Repair & Maintenance; FUEL AMERICA → Fuel Expense.
-- FINANCIAL-HOLD: owner Neon-applies. Idempotent. No DROP.

BEGIN;

ALTER TABLE accounting.banking_rules
  ADD COLUMN IF NOT EXISTS merchant_contains text;

ALTER TABLE accounting.banking_rules
  ADD COLUMN IF NOT EXISTS rule_key text;

-- Seed / ops idempotency: one active rule_key per company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_banking_rules_company_rule_key
  ON accounting.banking_rules (operating_company_id, rule_key)
  WHERE rule_key IS NOT NULL AND is_active = true;

-- Also unique active merchant_contains per company (case-insensitive) when set.
CREATE UNIQUE INDEX IF NOT EXISTS uq_banking_rules_company_merchant_contains
  ON accounting.banking_rules (operating_company_id, lower(merchant_contains))
  WHERE merchant_contains IS NOT NULL AND is_active = true;

-- TRANSP seeds (canonical CoA UUIDs from 202606280930_bank_feed_transp_transaction_categories_seed.sql)
DO $$
DECLARE
  v_transp uuid;
  v_fuel uuid := '58c6e304-ab3e-4714-9c35-623ec51ae7cf'::uuid;
  v_maint uuid := '27c4a09a-0d34-4908-9da1-44b6174b5bce'::uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'banking_rules seeds skipped: TRANSP company not found';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.id = v_fuel AND a.operating_company_id = v_transp
      AND a.deactivated_at IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM accounting.banking_rules r
    WHERE r.operating_company_id = v_transp
      AND r.rule_key = 'seed:fuel-america-to-fuel'
      AND r.is_active = true
  ) THEN
    INSERT INTO accounting.banking_rules (
      operating_company_id, priority, merchant_contains, description_contains,
      then_account_id, rule_key, is_active
    )
    VALUES (
      v_transp, 1000, 'FUEL AMERICA', 'FUEL AMERICA',
      v_fuel, 'seed:fuel-america-to-fuel', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.id = v_maint AND a.operating_company_id = v_transp
      AND a.deactivated_at IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM accounting.banking_rules r
    WHERE r.operating_company_id = v_transp
      AND r.rule_key = 'seed:loves-tire-care-to-maintenance'
      AND r.is_active = true
  ) THEN
    INSERT INTO accounting.banking_rules (
      operating_company_id, priority, merchant_contains, description_contains,
      then_account_id, rule_key, is_active
    )
    VALUES (
      v_transp, 1000, 'LOVE''S TIRE CARE', 'LOVE''S TIRE CARE',
      v_maint, 'seed:loves-tire-care-to-maintenance', true
    );
  END IF;
END $$;

COMMIT;
