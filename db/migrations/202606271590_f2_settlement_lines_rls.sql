-- F2 — Add RLS company-isolation policy to driver_finance.settlement_lines.
--
-- Audit finding (2026-06-27): migration 0191_driver_finance_settlement_lines.sql
-- creates driver_finance.settlement_lines and grants ih35_app but never enables
-- Row Level Security or creates a company-isolation policy. Any tenant could read
-- another tenant's driver pay line items if app.operating_company_id is unset.
--
-- Fix: ENABLE RLS + company-isolation policy (FOR ALL) matching the pattern used
-- by driver_finance.driver_settlements in migration 0124 and driver_finance.driver_bills
-- in migration 0141.
--
-- The policy allows:
--   - lucia bypass (cron/system actors) — full access
--   - ih35_app — rows where settlement.operating_company_id matches the session var
--
-- NOTE: settlement_lines.operating_company_id is NOT a direct column — the company
-- scope is inherited through the parent driver_settlements row. The policy joins
-- through the parent to enforce isolation (same pattern as RLS on child tables).
-- A direct operating_company_id column is added here for performance and to match
-- the pattern used by all other driver_finance tables.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY are safe to re-run.

BEGIN;

-- Add operating_company_id to settlement_lines for direct RLS enforcement.
-- Backfill from parent driver_settlements row.
ALTER TABLE driver_finance.settlement_lines
  ADD COLUMN IF NOT EXISTS operating_company_id UUID REFERENCES org.companies(id);

UPDATE driver_finance.settlement_lines sl
SET operating_company_id = ds.operating_company_id
FROM driver_finance.driver_settlements ds
WHERE sl.settlement_id = ds.id
  AND sl.operating_company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_settlement_lines_company
  ON driver_finance.settlement_lines (operating_company_id);

-- Trigger: auto-populate operating_company_id from parent driver_settlements on INSERT.
-- This means existing INSERT callers don't need to be updated — the column is derived.
CREATE OR REPLACE FUNCTION driver_finance.settlement_lines_set_company()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.operating_company_id IS NULL THEN
    SELECT operating_company_id INTO NEW.operating_company_id
    FROM driver_finance.driver_settlements
    WHERE id = NEW.settlement_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_lines_set_company ON driver_finance.settlement_lines;
CREATE TRIGGER trg_settlement_lines_set_company
  BEFORE INSERT ON driver_finance.settlement_lines
  FOR EACH ROW EXECUTE FUNCTION driver_finance.settlement_lines_set_company();

-- Enable RLS and create company-isolation policy.
ALTER TABLE driver_finance.settlement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_lines_company_scope ON driver_finance.settlement_lines;
CREATE POLICY settlement_lines_company_scope ON driver_finance.settlement_lines
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

COMMIT;
