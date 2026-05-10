BEGIN;

-- G18: enforce load linkage for over-the-road expense activity.
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id),
  ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS load_exemption_reason text,
  ADD COLUMN IF NOT EXISTS line_category text;

DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE fuel.fuel_transactions
        ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id),
        ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS load_exemption_reason text
    ';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_expense_lines_load
  ON accounting.expense_lines (load_id)
  WHERE load_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_fuel_txn_load
      ON fuel.fuel_transactions (load_id)
      WHERE load_id IS NOT NULL
    ';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS accounting.line_category_load_required (
  line_category text PRIMARY KEY,
  description text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE accounting.line_category_load_required ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS line_category_load_required_select ON accounting.line_category_load_required;
CREATE POLICY line_category_load_required_select ON accounting.line_category_load_required
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  );

DROP POLICY IF EXISTS line_category_load_required_write ON accounting.line_category_load_required;
CREATE POLICY line_category_load_required_write ON accounting.line_category_load_required
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  );

INSERT INTO accounting.line_category_load_required (line_category, description) VALUES
  ('diesel', 'Fuel purchases - must tie to a load'),
  ('def', 'DEF - must tie to a load'),
  ('toll', 'Tolls - must tie to a load'),
  ('scale', 'Scale fees - must tie to a load'),
  ('lumper', 'Lumper fees - must tie to a load'),
  ('parking', 'Truck parking - must tie to a load'),
  ('roadside_repair', 'Roadside repairs - must tie to a load'),
  ('detention_paid', 'Detention paid out - must tie to a load'),
  ('over_road_other', 'Other over-the-road expense - must tie to a load')
ON CONFLICT (line_category) DO NOTHING;

CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger AS $$
DECLARE
  v_required boolean := false;
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
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% category=% requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      COALESCE(NEW.line_category, 'n/a');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_line_load_fk ON accounting.expense_lines;
CREATE TRIGGER trg_expense_line_load_fk
  BEFORE INSERT OR UPDATE ON accounting.expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION accounting.enforce_load_fk_invariant();

DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
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

-- G19: work-order open/close tracking with generated duration.
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS duration_seconds bigint
    GENERATED ALWAYS AS (
      CASE
        WHEN closed_at IS NOT NULL AND opened_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (closed_at - opened_at))::bigint
        ELSE NULL
      END
    ) STORED;

UPDATE maintenance.work_orders
SET opened_at = COALESCE(created_at, now())
WHERE opened_at IS NULL;

UPDATE maintenance.work_orders
SET closed_at = COALESCE(updated_at, now())
WHERE closed_at IS NULL
  AND status IN ('closed', 'completed', 'voided', 'complete', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_wo_duration
  ON maintenance.work_orders (operating_company_id, duration_seconds DESC)
  WHERE duration_seconds IS NOT NULL;

CREATE OR REPLACE FUNCTION maintenance.wo_set_opened_at()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.opened_at IS NULL THEN
    NEW.opened_at := COALESCE(NEW.created_at, now());
  ELSIF TG_OP = 'UPDATE' AND OLD.opened_at IS DISTINCT FROM NEW.opened_at THEN
    RAISE EXCEPTION 'E_WO_OPENED_AT_IMMUTABLE: opened_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_set_opened_at ON maintenance.work_orders;
CREATE TRIGGER trg_wo_set_opened_at
  BEFORE INSERT OR UPDATE ON maintenance.work_orders
  FOR EACH ROW EXECUTE FUNCTION maintenance.wo_set_opened_at();

CREATE OR REPLACE FUNCTION maintenance.wo_set_closed_at()
RETURNS trigger AS $$
BEGIN
  IF OLD.closed_at IS NOT NULL THEN
    NEW.closed_at := OLD.closed_at;
    RETURN NEW;
  END IF;

  IF (NEW.status IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND (COALESCE(OLD.status, '') NOT IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND NEW.closed_at IS NULL
  THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_set_closed_at ON maintenance.work_orders;
CREATE TRIGGER trg_wo_set_closed_at
  BEFORE UPDATE ON maintenance.work_orders
  FOR EACH ROW EXECUTE FUNCTION maintenance.wo_set_closed_at();

COMMIT;
