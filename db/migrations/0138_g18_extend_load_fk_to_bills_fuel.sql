BEGIN;

-- Migration 0138: G18 invariant #18 — extend load FK enforcement to accounting.bill_lines
-- and ensure fuel.fuel_transactions wiring matches accounting.enforce_load_fk_invariant().
-- Idempotent guards via to_regclass / IF EXISTS patterns where applicable.

CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_required boolean := false;
  v_category text := 'n/a';
BEGIN
  IF NEW.load_exemption_reason IS NOT NULL THEN
    IF length(trim(NEW.load_exemption_reason)) < 20 THEN
      RAISE EXCEPTION
        'E_LOAD_EXEMPTION_REASON_TOO_SHORT: load_exemption_reason must be >=20 chars';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME = 'expense_lines' THEN
    v_required := COALESCE(NEW.load_required, false);
    v_category := COALESCE(NEW.line_category, 'n/a');
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME = 'bill_lines' THEN
    v_required := COALESCE(NEW.load_required, false);
    v_category := COALESCE(NEW.expense_category_uuid::text, 'n/a');
    IF NOT v_required AND NEW.expense_category_uuid IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM catalogs.accounts a
        WHERE a.id = NEW.expense_category_uuid
          AND (
            a.account_name ILIKE '%fuel%'
            OR a.account_name ILIKE '%diesel%'
            OR a.account_name ILIKE '%roadside%'
            OR EXISTS (
              SELECT 1
              FROM accounting.line_category_load_required r
              WHERE r.line_category = a.account_name
            )
          )
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
    v_category := 'fuel_transaction';
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% category=% requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      v_category;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('accounting.bill_lines') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE accounting.bill_lines
        ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id),
        ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS load_exemption_reason text
    ';
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_bill_lines_load
        ON accounting.bill_lines (load_id)
        WHERE load_id IS NOT NULL
    ';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bill_line_load_fk ON accounting.bill_lines';
    EXECUTE '
      CREATE TRIGGER trg_bill_line_load_fk
        BEFORE INSERT OR UPDATE ON accounting.bill_lines
        FOR EACH ROW
        EXECUTE FUNCTION accounting.enforce_load_fk_invariant()
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE fuel.fuel_transactions
        ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id),
        ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS load_exemption_reason text
    ';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_fuel_txn_load_fk ON fuel.fuel_transactions';
    EXECUTE '
      CREATE TRIGGER trg_fuel_txn_load_fk
        BEFORE INSERT OR UPDATE ON fuel.fuel_transactions
        FOR EACH ROW
        EXECUTE FUNCTION accounting.enforce_load_fk_invariant()
    ';
  END IF;
END
$$;

INSERT INTO audit.audit_events (event_class, severity, payload, source)
SELECT
  'g18.backfill_audit',
  'info',
  jsonb_build_object(
    'table', 'bill_lines',
    'noncompliant_count', COALESCE(c.cnt, 0),
    'window_days', 30
  ),
  'migration_0138_g18_extend_load_fk_to_bills_fuel'
FROM (
  SELECT count(*)::bigint AS cnt
  FROM accounting.bill_lines bl
  JOIN accounting.bills b ON b.id = bl.bill_id
  WHERE b.bill_date > (CURRENT_DATE - interval '30 days')
    AND bl.load_id IS NULL
    AND bl.load_exemption_reason IS NULL
    AND bl.expense_category_uuid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM catalogs.accounts a
      WHERE a.id = bl.expense_category_uuid
        AND (
          a.account_name ILIKE '%fuel%'
          OR a.account_name ILIKE '%diesel%'
          OR a.account_name ILIKE '%roadside%'
          OR EXISTS (
            SELECT 1
            FROM accounting.line_category_load_required r
            WHERE r.line_category = a.account_name
          )
        )
    )
) c;

COMMIT;
