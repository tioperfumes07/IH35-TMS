-- 202615320904 · CC-3 · ROUND 345 THE BLOCK, phase 1 (financial) — "block from having post on another company from now on"
-- (owner). Every financial line must belong to the SAME company as each company-scoped row it references. The pattern
-- already proven here (factoring.canonical_factor_agreements): a composite foreign key (operating_company_id, x) ->
-- parent (operating_company_id, id) makes a cross-company reference structurally impossible.
--   * each FK is added NOT VALID, then VALIDATED: measured on prod under SET LOCAL app.bypass_rls = 'lucia' — every one of
--     these relationships has 0 cross-company rows and 0 references to a company-less parent. MATCH SIMPLE skips a row
--     whose operating_company_id is NULL, so the 534 orphan lines (ROUND 345, awaiting the owner) validate untouched.
--   * a NULL company would switch the FK off for that row — so bill_lines / expense_lines (the two with a nullable
--     operating_company_id) get CHECK (operating_company_id IS NOT NULL) NOT VALID: every NEW or UPDATED row must carry a
--     company; the 534 historical orphans stay as they are until the owner rules (then VALIDATE).
--   * each composite FK repeats its single-column twin's ON DELETE so the reverse -> void -> purge sequence is unchanged.
-- Idempotent. History is not modified.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.invoice_lines'::regclass AND conname = 'invoice_lines_account_same_entity_fkey') THEN
    ALTER TABLE accounting.invoice_lines ADD CONSTRAINT invoice_lines_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, account_id) REFERENCES catalogs.accounts (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.invoice_lines VALIDATE CONSTRAINT invoice_lines_account_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.invoice_lines'::regclass AND conname = 'invoice_lines_invoice_same_entity_fkey') THEN
    ALTER TABLE accounting.invoice_lines ADD CONSTRAINT invoice_lines_invoice_same_entity_fkey
      FOREIGN KEY (operating_company_id, invoice_id) REFERENCES accounting.invoices (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.invoice_lines VALIDATE CONSTRAINT invoice_lines_invoice_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.invoice_lines'::regclass AND conname = 'invoice_lines_item_same_entity_fkey') THEN
    ALTER TABLE accounting.invoice_lines ADD CONSTRAINT invoice_lines_item_same_entity_fkey
      FOREIGN KEY (operating_company_id, item_id) REFERENCES catalogs.items (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.invoice_lines VALIDATE CONSTRAINT invoice_lines_item_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.invoice_lines'::regclass AND conname = 'invoice_lines_load_same_entity_fkey') THEN
    ALTER TABLE accounting.invoice_lines ADD CONSTRAINT invoice_lines_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, source_load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.invoice_lines VALIDATE CONSTRAINT invoice_lines_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_account_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, account_id) REFERENCES catalogs.accounts (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_account_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_class_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_class_same_entity_fkey
      FOREIGN KEY (operating_company_id, class_id) REFERENCES catalogs.classes (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_class_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_lease_asset_line_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_lease_asset_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, lease_asset_line_id) REFERENCES accounting.lease_asset_line (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_lease_asset_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_lease_contract_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_lease_contract_same_entity_fkey
      FOREIGN KEY (operating_company_id, lease_contract_id) REFERENCES accounting.lease_contract (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_lease_contract_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_load_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_customer_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, billable_customer_uuid) REFERENCES mdata.customers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_customer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_driver_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_account_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, expense_account_uuid) REFERENCES catalogs.accounts (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_account_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_load_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.payment_applications'::regclass AND conname = 'payment_applications_invoice_same_entity_fkey') THEN
    ALTER TABLE accounting.payment_applications ADD CONSTRAINT payment_applications_invoice_same_entity_fkey
      FOREIGN KEY (operating_company_id, invoice_id) REFERENCES accounting.invoices (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.payment_applications VALIDATE CONSTRAINT payment_applications_invoice_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.payment_applications'::regclass AND conname = 'payment_applications_payment_same_entity_fkey') THEN
    ALTER TABLE accounting.payment_applications ADD CONSTRAINT payment_applications_payment_same_entity_fkey
      FOREIGN KEY (operating_company_id, payment_id) REFERENCES accounting.payments (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.payment_applications VALIDATE CONSTRAINT payment_applications_payment_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.transaction_source_links'::regclass AND conname = 'transaction_source_links_posting_same_entity_fkey') THEN
    ALTER TABLE accounting.transaction_source_links ADD CONSTRAINT transaction_source_links_posting_same_entity_fkey
      FOREIGN KEY (operating_company_id, journal_entry_posting_id) REFERENCES accounting.journal_entry_postings (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.transaction_source_links VALIDATE CONSTRAINT transaction_source_links_posting_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_company_required') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_company_required') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
