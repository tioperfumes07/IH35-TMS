-- 202615740913 · CC-3 · LEAD 443.101 R2 — the true missing foreign keys found by verify-orphan-fk-inventory.
-- Each column below references a row by id with no constraint, so nothing stopped an orphan or (for company-scoped
-- parents) a cross-company pointer. Measured on prod read-only 2026-10-12 before writing: 0 orphans and 0 cross-company
-- rows for every column here, so each FK is added NOT VALID, then VALIDATED.
--   * company-scoped parents -> same-entity composite FK (ROUND 345 pattern, 202615700900); three parents gain the
--     (operating_company_id, id) key it references (id is already the PK, so the key cannot fail).
--   * identity.users / org.companies -> plain FK.
--   * Four FKs exist on prod but were created by no migration (prod-only drift): they are restated here under prod's
--     exact constraint names, so a fresh database matches prod; on prod each block is a no-op.
-- Every block is skipped when the column already carries ANY FK, or the table is absent (accounting.lease_lessee_schedule_period
-- is not on prod today). Idempotent. History is not modified.
SET LOCAL lock_timeout = '60s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fuel.fuel_transactions'::regclass AND conname = 'fuel_transactions_co_id_key') THEN
    ALTER TABLE fuel.fuel_transactions ADD CONSTRAINT fuel_transactions_co_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'integrations.relay_fuel_transactions'::regclass AND conname = 'relay_fuel_transactions_co_id_key') THEN
    ALTER TABLE integrations.relay_fuel_transactions ADD CONSTRAINT relay_fuel_transactions_co_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'banking.bank_transactions'::regclass AND conname = 'bank_transactions_co_id_key') THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_transactions_co_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.check_number_registry'::regclass AND a.attname = 'reinstated_from_void_je_id') THEN
    ALTER TABLE banking.check_number_registry ADD CONSTRAINT check_number_registry_reinstated_from_void_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, reinstated_from_void_je_id) REFERENCES accounting.journal_entries (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.check_number_registry VALIDATE CONSTRAINT check_number_registry_reinstated_from_void_je_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'accounting.journal_entries'::regclass AND a.attname = 'reinstated_from_void_je_id') THEN
    ALTER TABLE accounting.journal_entries ADD CONSTRAINT journal_entries_reinstated_from_void_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, reinstated_from_void_je_id) REFERENCES accounting.journal_entries (operating_company_id, id) NOT VALID;
    ALTER TABLE accounting.journal_entries VALIDATE CONSTRAINT journal_entries_reinstated_from_void_je_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.bank_account_tieouts'::regclass AND a.attname = 'ledger_account_id') THEN
    ALTER TABLE banking.bank_account_tieouts ADD CONSTRAINT bank_account_tieouts_ledger_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, ledger_account_id) REFERENCES catalogs.accounts (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.bank_account_tieouts VALIDATE CONSTRAINT bank_account_tieouts_ledger_account_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.reconciliation_matches'::regclass AND a.attname = 'release_reversal_je_id') THEN
    ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_release_reversal_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, release_reversal_je_id) REFERENCES accounting.journal_entries (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.reconciliation_matches VALIDATE CONSTRAINT reconciliation_matches_release_reversal_je_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'accounting.reclassify_batch_lines'::regclass AND a.attname = 'from_item_id') THEN
    ALTER TABLE accounting.reclassify_batch_lines ADD CONSTRAINT reclassify_batch_lines_from_item_same_entity_fkey
      FOREIGN KEY (operating_company_id, from_item_id) REFERENCES catalogs.items (operating_company_id, id) NOT VALID;
    ALTER TABLE accounting.reclassify_batch_lines VALIDATE CONSTRAINT reclassify_batch_lines_from_item_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'accounting.reclassify_batch_lines'::regclass AND a.attname = 'from_load_id') THEN
    ALTER TABLE accounting.reclassify_batch_lines ADD CONSTRAINT reclassify_batch_lines_from_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, from_load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
    ALTER TABLE accounting.reclassify_batch_lines VALIDATE CONSTRAINT reclassify_batch_lines_from_load_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.bank_transactions'::regclass AND a.attname = 'matched_fuel_transaction_id') THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_transactions_matched_fuel_transaction_same_entity_fkey
      FOREIGN KEY (operating_company_id, matched_fuel_transaction_id) REFERENCES fuel.fuel_transactions (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.bank_transactions VALIDATE CONSTRAINT bank_transactions_matched_fuel_transaction_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.bank_transactions'::regclass AND a.attname = 'matched_relay_fuel_transaction_id') THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_transactions_matched_relay_fuel_same_entity_fkey
      FOREIGN KEY (operating_company_id, matched_relay_fuel_transaction_id) REFERENCES integrations.relay_fuel_transactions (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.bank_transactions VALIDATE CONSTRAINT bank_transactions_matched_relay_fuel_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = 'banking.transfers'::regclass AND a.attname = 'minted_from_bank_transaction_id') THEN
    ALTER TABLE banking.transfers ADD CONSTRAINT transfers_minted_from_bank_transaction_same_entity_fkey
      FOREIGN KEY (operating_company_id, minted_from_bank_transaction_id) REFERENCES banking.bank_transactions (operating_company_id, id) NOT VALID;
    ALTER TABLE banking.transfers VALIDATE CONSTRAINT transfers_minted_from_bank_transaction_same_entity_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('banking.check_number_registry') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('banking.check_number_registry') AND a.attname = 'reinstated_by_user_id') THEN
    ALTER TABLE banking.check_number_registry ADD CONSTRAINT check_number_registry_reinstated_by_user_id_fkey
      FOREIGN KEY (reinstated_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE banking.check_number_registry VALIDATE CONSTRAINT check_number_registry_reinstated_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('driver_finance.settlement_line_item_splits') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('driver_finance.settlement_line_item_splits') AND a.attname = 'created_by_user_id') THEN
    ALTER TABLE driver_finance.settlement_line_item_splits ADD CONSTRAINT settlement_line_item_splits_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE driver_finance.settlement_line_item_splits VALIDATE CONSTRAINT settlement_line_item_splits_created_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('accounting.journal_entries') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('accounting.journal_entries') AND a.attname = 'reinstated_by_user_id') THEN
    ALTER TABLE accounting.journal_entries ADD CONSTRAINT journal_entries_reinstated_by_user_id_fkey
      FOREIGN KEY (reinstated_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE accounting.journal_entries VALIDATE CONSTRAINT journal_entries_reinstated_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('fleet.roster_findings') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('fleet.roster_findings') AND a.attname = 'voided_by_user_id') THEN
    ALTER TABLE fleet.roster_findings ADD CONSTRAINT roster_findings_voided_by_user_id_fkey
      FOREIGN KEY (voided_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE fleet.roster_findings VALIDATE CONSTRAINT roster_findings_voided_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('accounting.lease_lessee_schedule_period') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('accounting.lease_lessee_schedule_period') AND a.attname = 'created_by_user_id') THEN
    ALTER TABLE accounting.lease_lessee_schedule_period ADD CONSTRAINT lease_lessee_schedule_period_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE accounting.lease_lessee_schedule_period VALIDATE CONSTRAINT lease_lessee_schedule_period_created_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('accounting.lease_lessee_schedule_period') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('accounting.lease_lessee_schedule_period') AND a.attname = 'voided_by_user_id') THEN
    ALTER TABLE accounting.lease_lessee_schedule_period ADD CONSTRAINT lease_lessee_schedule_period_voided_by_user_id_fkey
      FOREIGN KEY (voided_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE accounting.lease_lessee_schedule_period VALIDATE CONSTRAINT lease_lessee_schedule_period_voided_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('audit.record_deletions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('audit.record_deletions') AND a.attname = 'deleted_by_user_id') THEN
    ALTER TABLE audit.record_deletions ADD CONSTRAINT record_deletions_deleted_by_user_id_fkey
      FOREIGN KEY (deleted_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE audit.record_deletions VALIDATE CONSTRAINT record_deletions_deleted_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('accounting.document_work_order_copies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('accounting.document_work_order_copies') AND a.attname = 'captured_by_user_id') THEN
    ALTER TABLE accounting.document_work_order_copies ADD CONSTRAINT document_work_order_copies_captured_by_user_id_fkey
      FOREIGN KEY (captured_by_user_id) REFERENCES identity.users (id) NOT VALID;
    ALTER TABLE accounting.document_work_order_copies VALIDATE CONSTRAINT document_work_order_copies_captured_by_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('telematics.unit_stop_events') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('telematics.unit_stop_events') AND a.attname = 'operating_company_id') THEN
    ALTER TABLE telematics.unit_stop_events ADD CONSTRAINT telematics_unit_stop_events_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies (id) NOT VALID;
    ALTER TABLE telematics.unit_stop_events VALIDATE CONSTRAINT telematics_unit_stop_events_operating_company_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('audit.record_deletions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('audit.record_deletions') AND a.attname = 'operating_company_id') THEN
    ALTER TABLE audit.record_deletions ADD CONSTRAINT audit_record_deletions_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies (id) NOT VALID;
    ALTER TABLE audit.record_deletions VALIDATE CONSTRAINT audit_record_deletions_operating_company_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('catalogs.downtime_categories') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('catalogs.downtime_categories') AND a.attname = 'operating_company_id') THEN
    ALTER TABLE catalogs.downtime_categories ADD CONSTRAINT downtime_categories_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies (id) NOT VALID;
    ALTER TABLE catalogs.downtime_categories VALIDATE CONSTRAINT downtime_categories_operating_company_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('catalogs.downtime_fault_parties') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('catalogs.downtime_fault_parties') AND a.attname = 'operating_company_id') THEN
    ALTER TABLE catalogs.downtime_fault_parties ADD CONSTRAINT downtime_fault_parties_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies (id) NOT VALID;
    ALTER TABLE catalogs.downtime_fault_parties VALIDATE CONSTRAINT downtime_fault_parties_operating_company_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f' AND con.conrelid = to_regclass('banking.bank_transactions') AND a.attname = 'matched_factoring_advance_id') THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_transactions_matched_factoring_advance_id_fkey
      FOREIGN KEY (matched_factoring_advance_id) REFERENCES accounting.factoring_advances (id) NOT VALID;
    ALTER TABLE banking.bank_transactions VALIDATE CONSTRAINT bank_transactions_matched_factoring_advance_id_fkey;
  END IF;
END $$;
