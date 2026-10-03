-- 202615330904 · CC-3 · ROUND 345 THE BLOCK, phase 2 (driver finance) — "block from having post on another company from
-- now on" (owner). Same pattern as phase 1 (202615320904 / 0908): every company-bearing FK on settlement_lines,
-- escrow_balances and driver_advance_accounts gets a composite (operating_company_id, x) -> parent (operating_company_id,
-- id) twin repeating its ON DELETE. Measured on prod under SET LOCAL app.bypass_rls = 'lucia' (2026-10-03):
--   * 10 relationships: 0 cross-company rows -> added NOT VALID, then VALIDATED.
--   * escrow_balances.driver_id and driver_advance_accounts.driver_id: exactly 1 cross-company row each — the escrow
--     artifact 009d57e9 and advance account QBO-149-001, both pointing at a TRANSP driver record and both awaiting the
--     owner's ruling (ROUND 345 Part 2). DO NOT TOUCH TRANSPORTATION: those rows are not changed. The FK is added
--     NOT VALID — every NEW or UPDATED row is refused if cross-company; VALIDATE after the ruling.
--   * settlement_lines.operating_company_id is nullable with 0 NULL rows: CHECK (operating_company_id IS NOT NULL),
--     VALIDATED, so MATCH SIMPLE cannot be bypassed with a NULL company.
-- Idempotent. History is not modified.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_settlement_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_settlement_same_entity_fkey
      FOREIGN KEY (operating_company_id, settlement_id) REFERENCES driver_finance.driver_settlements (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_settlement_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_team_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_team_same_entity_fkey
      FOREIGN KEY (operating_company_id, team_id) REFERENCES mdata.driver_teams (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_team_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_driver_bill_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_driver_bill_same_entity_fkey
      FOREIGN KEY (operating_company_id, source_driver_bill_id) REFERENCES driver_finance.driver_bills (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_driver_bill_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_deduction_policy_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_deduction_policy_same_entity_fkey
      FOREIGN KEY (operating_company_id, auto_deduction_policy_id) REFERENCES driver_finance.auto_deduction_policies (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_deduction_policy_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_load_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_disputed_by_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_disputed_by_same_entity_fkey
      FOREIGN KEY (operating_company_id, disputed_by) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_disputed_by_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_split_partner_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_split_partner_same_entity_fkey
      FOREIGN KEY (operating_company_id, split_partner_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_split_partner_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_void_reversal_je_same_entity_fkey') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_void_reversal_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, void_reversal_entry_id) REFERENCES accounting.journal_entries (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_void_reversal_je_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.escrow_balances'::regclass AND conname = 'escrow_balances_driver_same_entity_fkey') THEN
    ALTER TABLE driver_finance.escrow_balances ADD CONSTRAINT escrow_balances_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
-- escrow_balances_driver_same_entity_fkey: NOT VALID until the owner rules on the one cross-company row (see header).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.escrow_balances'::regclass AND conname = 'escrow_balances_last_settlement_same_entity_fkey') THEN
    ALTER TABLE driver_finance.escrow_balances ADD CONSTRAINT escrow_balances_last_settlement_same_entity_fkey
      FOREIGN KEY (operating_company_id, last_settlement_id) REFERENCES driver_finance.driver_settlements (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.escrow_balances VALIDATE CONSTRAINT escrow_balances_last_settlement_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.driver_advance_accounts'::regclass AND conname = 'driver_advance_accounts_driver_same_entity_fkey') THEN
    ALTER TABLE driver_finance.driver_advance_accounts ADD CONSTRAINT driver_advance_accounts_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
-- driver_advance_accounts_driver_same_entity_fkey: NOT VALID until the owner rules on the one cross-company row (see header).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.driver_advance_accounts'::regclass AND conname = 'driver_advance_accounts_account_same_entity_fkey') THEN
    ALTER TABLE driver_finance.driver_advance_accounts ADD CONSTRAINT driver_advance_accounts_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, coa_account_id) REFERENCES catalogs.accounts (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.driver_advance_accounts VALIDATE CONSTRAINT driver_advance_accounts_account_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'driver_finance.settlement_lines'::regclass AND conname = 'settlement_lines_company_required') THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines VALIDATE CONSTRAINT settlement_lines_company_required;
