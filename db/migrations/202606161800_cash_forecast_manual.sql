-- CASH-FORECAST-MANUAL (Block F): firewalled, hand-entered daily cash projection.
-- Own schema `forecast`. NO foreign keys into accounting/mdata/banking — pickers store
-- snapshots only. NO GL posting. Per-entity RLS. Idempotent.

CREATE SCHEMA IF NOT EXISTS forecast;

-- Editable per-entity opening balance; the running projected balance carries from here.
CREATE TABLE IF NOT EXISTS forecast.opening_balance (
  operating_company_id uuid PRIMARY KEY,
  amount_cents bigint NOT NULL DEFAULT 0,
  as_of_date date,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hand-entered predicted income/expense lines. Party + ref are free-text SNAPSHOTS
-- (no FK) so the firewall holds even if the referenced master row changes or is removed.
CREATE TABLE IF NOT EXISTS forecast.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  entry_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('income', 'expense')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  party_name text,
  invoice_no text,
  category text,
  memo text,
  -- Optional picker snapshot (account|unit|driver|truck|trailer). Stored as plain
  -- text/uuid with NO foreign-key constraint to any other schema.
  ref_kind text CHECK (ref_kind IS NULL OR ref_kind IN ('account', 'unit', 'driver', 'truck', 'trailer')),
  ref_label text,
  ref_external_id text,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_forecast_cash_entries_company_date
  ON forecast.cash_entries (operating_company_id, entry_date)
  WHERE deactivated_at IS NULL;

-- RLS: strict per operating_company_id (TRK/TRANSP/USMCA independent; no commingling).
ALTER TABLE forecast.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast.opening_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forecast_cash_entries_rls ON forecast.cash_entries;
CREATE POLICY forecast_cash_entries_rls ON forecast.cash_entries
  FOR ALL
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);

DROP POLICY IF EXISTS forecast_opening_balance_rls ON forecast.opening_balance;
CREATE POLICY forecast_opening_balance_rls ON forecast.opening_balance
  FOR ALL
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);

-- Runtime grants for ih35_app (new schema is not covered by migration 0065's array).
GRANT USAGE ON SCHEMA forecast TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA forecast TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA forecast
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
