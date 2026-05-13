-- P6-T11176 — Load-bookended settlement columns + expense-to-load attribution (additive).
-- Repo canonical table is driver_finance.driver_settlements (NOT driver_finance.settlements).

BEGIN;

-- ─── Extend settlement status enum (additive CHECK replacement) ───────────────
DO $$
DECLARE
  conname text;
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping driver_settlements status check: table missing';
    RETURN;
  END IF;

  SELECT c.conname
    INTO conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
   WHERE n.nspname = 'driver_finance'
     AND t.relname = 'driver_settlements'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%status%'
   ORDER BY c.conname
   LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE driver_finance.driver_settlements DROP CONSTRAINT %I', conname);
  END IF;

  BEGIN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_status_check CHECK (
        status IN (
          'draft', 'presettle', 'acked', 'locked', 'paid',
          'held', 'cancelled', 'final', 'ready', 'approved',
          'open', 'closed'
        )
      );
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'Skipping 0143 driver_settlements columns: table missing';
    RETURN;
  END IF;

  ALTER TABLE driver_finance.driver_settlements
    ADD COLUMN IF NOT EXISTS first_load_id UUID REFERENCES mdata.loads(id),
    ADD COLUMN IF NOT EXISTS first_load_number TEXT,
    ADD COLUMN IF NOT EXISTS last_load_id UUID REFERENCES mdata.loads(id),
    ADD COLUMN IF NOT EXISTS last_load_number TEXT,
    ADD COLUMN IF NOT EXISTS trip_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trip_closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settlement_model TEXT,
    ADD COLUMN IF NOT EXISTS pay_method TEXT;

  ALTER TABLE driver_finance.driver_settlements
    DROP CONSTRAINT IF EXISTS driver_settlements_settlement_model_check;

  ALTER TABLE driver_finance.driver_settlements
    ADD CONSTRAINT driver_settlements_settlement_model_check CHECK (
      settlement_model IS NULL OR settlement_model IN ('week_calendar', 'load_bookended')
    );

  UPDATE driver_finance.driver_settlements
    SET settlement_model = 'week_calendar'
    WHERE settlement_model IS NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS ix_driver_settlements_first_load_id
        ON driver_finance.driver_settlements(first_load_id)
        WHERE first_load_id IS NOT NULL
    $idx$;

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS ix_driver_settlements_active_load_bookended
        ON driver_finance.driver_settlements(driver_id, trip_closed_at)
        WHERE trip_closed_at IS NULL AND settlement_model = 'load_bookended'
    $idx$;
  END IF;
END $$;

-- ─── Expense attribution schema ─────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS expense_attribution;

CREATE TABLE IF NOT EXISTS expense_attribution.expense_load_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  expense_id UUID NOT NULL,
  expense_source TEXT NOT NULL CHECK (expense_source IN ('accounting', 'driver_finance')),
  load_id UUID NOT NULL REFERENCES mdata.loads(id),
  load_number TEXT NOT NULL,
  expense_seq INTEGER NOT NULL,
  expense_number TEXT NOT NULL,
  attribution_method TEXT NOT NULL CHECK (
    attribution_method IN ('auto_timestamp', 'auto_location', 'manual_override', 'user_assigned')
  ),
  attribution_confidence TEXT NOT NULL DEFAULT 'high' CHECK (
    attribution_confidence IN ('high', 'medium', 'low')
  ),
  attribution_reason TEXT,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attributed_by_user_id UUID,
  overridden_from_expense_number TEXT,
  UNIQUE (operating_company_id, expense_number),
  UNIQUE (expense_source, expense_id)
);

CREATE INDEX IF NOT EXISTS ix_expense_load_links_expense
  ON expense_attribution.expense_load_links(expense_source, expense_id);

CREATE INDEX IF NOT EXISTS ix_expense_load_links_load
  ON expense_attribution.expense_load_links(load_id);

CREATE INDEX IF NOT EXISTS ix_expense_load_links_operating_company
  ON expense_attribution.expense_load_links(operating_company_id);

CREATE TABLE IF NOT EXISTS expense_attribution.expense_seq_per_load (
  load_id UUID PRIMARY KEY REFERENCES mdata.loads(id),
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expense_attribution.expense_load_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_expense_load_links_company_scope ON expense_attribution.expense_load_links;
CREATE POLICY rls_expense_load_links_company_scope
  ON expense_attribution.expense_load_links
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

ALTER TABLE expense_attribution.expense_seq_per_load ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_expense_seq_per_load_load_scope ON expense_attribution.expense_seq_per_load;
CREATE POLICY rls_expense_seq_per_load_load_scope
  ON expense_attribution.expense_seq_per_load
  FOR ALL TO ih35_app
  USING (
    EXISTS (
      SELECT 1 FROM mdata.loads l
      WHERE l.id = expense_attribution.expense_seq_per_load.load_id
        AND (
          l.operating_company_id::text = current_setting('app.operating_company_id', true)
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mdata.loads l
      WHERE l.id = expense_attribution.expense_seq_per_load.load_id
        AND (
          l.operating_company_id::text = current_setting('app.operating_company_id', true)
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON expense_attribution.expense_load_links TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_attribution.expense_seq_per_load TO ih35_app;

-- Optional expense_number visibility on accounting.expenses when present in prod
DO $$
BEGIN
  IF to_regclass('accounting.expenses') IS NOT NULL THEN
    ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS expense_number TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expenses_company_expense_number
      ON accounting.expenses(operating_company_id, expense_number)
      WHERE expense_number IS NOT NULL;
  END IF;
END $$;

COMMIT;
