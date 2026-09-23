-- 202614271200_item_line_quantity_rate_amount.sql
--
-- Owner, Round 83 R3: "CATEGORIZE THEM AS ITEMS, PRODUCT SERVICE, SO YOU CAN HAVE THE QUANTITIES,
-- COST TOTALS, ETC. AS IN QUICKBOOKS." Every money line is item · description · QTY · RATE · AMOUNT,
-- amount = qty x rate, computed, never typed. Built by Cursor under the Lead's cross
-- (docs/bus/09-23-2026-LEAD-RULING-CURSOR-ITEM-LINE-SCHEMA-CROSS.md), claim 202614271200.
--
-- THE FOUR LINE TABLES: accounting.bill_lines, accounting.invoice_lines, driver_finance.settlement_lines
-- and accounting.expense_lines. No table is named "load cost line"; the load-linked cost line is
-- accounting.expense_lines (load_id, the load's expense number).
--
-- WHY the amount stays in each table's EXISTING column (bill_lines.amount, expense_lines.amount_cents,
-- settlement_lines.amount, invoice_lines.line_total_cents): every poster and report reads those
-- columns. A second, generated amount column would split the money of record in two. "Computed,
-- never typed" is enforced instead by a CHECK: whenever quantity and rate are present, the stored
-- amount must equal round(quantity x rate).
--
-- WHY rate is numeric(14,4) cents, not integer cents: a price per gallon is a fraction of a cent
-- ($5.229/gal = 522.9 cents). Checked against the settlement documents: 60.207 gal x 522.9 = 314.82;
-- 711.5 empty miles x 45 cents = 320.18. round() is half away from zero, which matches both.
-- quantity is numeric(14,3): gallons carry 3 decimals, miles 1.
--
-- WHY every CHECK is NOT VALID: the rows on these tables today are amount-only and the purge deletes
-- them. NOT VALID enforces the rule on every row written from now on without reading the doomed ones.
-- VALIDATE CONSTRAINT runs once, after the purge.
--
-- THE CATEGORY LAYER already exists: catalogs.items.category_id is a same-company FK to
-- catalogs.qbo_categories (migration 202606300100). No second category table is created here.
--
-- DOCUMENTS: lines keep attaching to their existing document (bill_id, invoice_id, settlement_id,
-- expense_id). Nothing here creates a document; one document carries many lines.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, constraints added only when absent. No data is
-- written. No RLS or grant change: every column lands on a table that already has both.

-- catalogs.items: the target of the same-company item FKs below. id is already the primary key, so
-- (operating_company_id, id) is unique by construction; the constraint only makes it referenceable.
DO $$
BEGIN
  IF to_regclass('catalogs.items') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_company_id' AND conrelid = 'catalogs.items'::regclass
  ) THEN
    ALTER TABLE catalogs.items ADD CONSTRAINT uq_items_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- accounting.bill_lines (amount numeric(12,2) dollars)
DO $$
BEGIN
  IF to_regclass('accounting.bill_lines') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS item_id uuid;
  ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS quantity numeric(14,3);
  ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS rate_cents numeric(14,4);
  ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS unit_of_measure text;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_item_same_company_fkey' AND conrelid = 'accounting.bill_lines'::regclass
  ) THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_item_same_company_fkey
      FOREIGN KEY (operating_company_id, item_id) REFERENCES catalogs.items (operating_company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_item_qty_rate_amount_check' AND conrelid = 'accounting.bill_lines'::regclass
  ) THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_item_qty_rate_amount_check CHECK (
      (item_id IS NULL AND quantity IS NULL AND rate_cents IS NULL AND unit_of_measure IS NULL)
      OR (
        item_id IS NOT NULL AND quantity IS NOT NULL AND rate_cents IS NOT NULL AND unit_of_measure IS NOT NULL
        AND quantity > 0
        AND unit_of_measure ~ '^[a-z][a-z_]*$'
        AND round(quantity * rate_cents) = round(amount * 100)
      )
    ) NOT VALID;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_bill_lines_item_id ON accounting.bill_lines (item_id) WHERE item_id IS NOT NULL;

  COMMENT ON COLUMN accounting.bill_lines.quantity IS
    'Item quantity (gallons 3dp, miles 1dp, each). With rate_cents, unit_of_measure and item_id, all or none; amount = round(quantity x rate_cents) / 100 (bill_lines_item_qty_rate_amount_check).';
  COMMENT ON COLUMN accounting.bill_lines.rate_cents IS
    'Rate per unit in cents, fractional cents allowed ($5.229/gal = 522.9).';
END $$;

-- accounting.expense_lines (the load-cost line; amount_cents bigint is the money column)
DO $$
BEGIN
  IF to_regclass('accounting.expense_lines') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS item_id uuid;
  ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS quantity numeric(14,3);
  ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS rate_cents numeric(14,4);
  ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS unit_of_measure text;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_item_same_company_fkey' AND conrelid = 'accounting.expense_lines'::regclass
  ) THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_item_same_company_fkey
      FOREIGN KEY (operating_company_id, item_id) REFERENCES catalogs.items (operating_company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_item_qty_rate_amount_check' AND conrelid = 'accounting.expense_lines'::regclass
  ) THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_item_qty_rate_amount_check CHECK (
      (item_id IS NULL AND quantity IS NULL AND rate_cents IS NULL AND unit_of_measure IS NULL)
      OR (
        item_id IS NOT NULL AND quantity IS NOT NULL AND rate_cents IS NOT NULL AND unit_of_measure IS NOT NULL
        AND quantity > 0
        AND unit_of_measure ~ '^[a-z][a-z_]*$'
        AND round(quantity * rate_cents) = amount_cents
      )
    ) NOT VALID;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_expense_lines_item_id ON accounting.expense_lines (item_id) WHERE item_id IS NOT NULL;

  COMMENT ON COLUMN accounting.expense_lines.quantity IS
    'Item quantity (gallons 3dp, miles 1dp, each). With rate_cents, unit_of_measure and item_id, all or none; amount_cents = round(quantity x rate_cents) (expense_lines_item_qty_rate_amount_check).';
  COMMENT ON COLUMN accounting.expense_lines.rate_cents IS
    'Rate per unit in cents, fractional cents allowed ($5.229/gal = 522.9).';
END $$;

-- driver_finance.settlement_lines (amount numeric(14,2) dollars; a deduction is negative, so its rate
-- is negative and its quantity stays positive)
DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS item_id uuid;
  ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS quantity numeric(14,3);
  ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS rate_cents numeric(14,4);
  ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS unit_of_measure text;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_lines_item_same_company_fkey' AND conrelid = 'driver_finance.settlement_lines'::regclass
  ) THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_item_same_company_fkey
      FOREIGN KEY (operating_company_id, item_id) REFERENCES catalogs.items (operating_company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_lines_item_qty_rate_amount_check' AND conrelid = 'driver_finance.settlement_lines'::regclass
  ) THEN
    ALTER TABLE driver_finance.settlement_lines ADD CONSTRAINT settlement_lines_item_qty_rate_amount_check CHECK (
      (item_id IS NULL AND quantity IS NULL AND rate_cents IS NULL AND unit_of_measure IS NULL)
      OR (
        item_id IS NOT NULL AND quantity IS NOT NULL AND rate_cents IS NOT NULL AND unit_of_measure IS NOT NULL
        AND quantity > 0
        AND unit_of_measure ~ '^[a-z][a-z_]*$'
        AND round(quantity * rate_cents) = round(amount * 100)
      )
    ) NOT VALID;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_settlement_lines_item_id ON driver_finance.settlement_lines (item_id) WHERE item_id IS NOT NULL;

  COMMENT ON COLUMN driver_finance.settlement_lines.quantity IS
    'Item quantity (loaded/empty miles 1dp, gallons 3dp, each). With rate_cents, unit_of_measure and item_id, all or none; amount = round(quantity x rate_cents) / 100 (settlement_lines_item_qty_rate_amount_check). A deduction carries a negative rate.';
  COMMENT ON COLUMN driver_finance.settlement_lines.rate_cents IS
    'Rate per unit in cents, fractional cents allowed (CPM 45 = $0.45/mile; negative for a deduction).';
END $$;

-- accounting.invoice_lines already carries quantity numeric(10,2), unit_amount_cents and
-- line_total_cents (all NOT NULL) and item_id. It gains unit_of_measure, and the same
-- computed-amount rule on its own columns.
DO $$
BEGIN
  IF to_regclass('accounting.invoice_lines') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE accounting.invoice_lines ADD COLUMN IF NOT EXISTS unit_of_measure text;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_qty_rate_amount_check' AND conrelid = 'accounting.invoice_lines'::regclass
  ) THEN
    ALTER TABLE accounting.invoice_lines ADD CONSTRAINT invoice_lines_qty_rate_amount_check CHECK (
      line_total_cents = round(quantity * unit_amount_cents)
      AND (unit_of_measure IS NULL OR unit_of_measure ~ '^[a-z][a-z_]*$')
    ) NOT VALID;
  END IF;

  COMMENT ON COLUMN accounting.invoice_lines.unit_of_measure IS
    'Unit of quantity (mile, gallon, hour, each). line_total_cents = round(quantity x unit_amount_cents) (invoice_lines_qty_rate_amount_check).';
END $$;
