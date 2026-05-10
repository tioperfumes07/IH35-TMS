BEGIN;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS is_oos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oos_since timestamptz,
  ADD COLUMN IF NOT EXISTS oos_reason text,
  ADD COLUMN IF NOT EXISTS oos_location text;

CREATE INDEX IF NOT EXISTS idx_units_oos
  ON mdata.units ((COALESCE(currently_leased_to_company_id, owner_company_id)), is_oos, oos_since)
  WHERE is_oos = true;

CREATE TABLE IF NOT EXISTS maintenance.severe_repair_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  trigger_wo_id uuid REFERENCES maintenance.work_orders(id),
  damage_severity text NOT NULL CHECK (damage_severity IN ('severe', 'out_of_service', 'total_loss')),
  estimate_status text NOT NULL DEFAULT 'open' CHECK (estimate_status IN ('open', 'awaiting_approval', 'approved', 'rejected', 'completed')),
  estimate_location text,
  estimated_labor_cents bigint NOT NULL DEFAULT 0,
  estimated_parts_cents bigint NOT NULL DEFAULT 0,
  estimated_outside_service_cents bigint NOT NULL DEFAULT 0,
  estimated_total_cents bigint GENERATED ALWAYS AS (
    estimated_labor_cents
    + estimated_parts_cents
    + estimated_outside_service_cents
  ) STORED,
  description text,
  estimated_completion_date date,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, unit_id, trigger_wo_id)
);

ALTER TABLE maintenance.severe_repair_estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_severe_repair_estimates_isolation ON maintenance.severe_repair_estimates;
CREATE POLICY rls_severe_repair_estimates_isolation
  ON maintenance.severe_repair_estimates
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_severe_estimate_unit
  ON maintenance.severe_repair_estimates (unit_id, estimate_status);
CREATE INDEX IF NOT EXISTS idx_severe_estimate_company_open
  ON maintenance.severe_repair_estimates (operating_company_id, estimate_status, estimated_total_cents DESC)
  WHERE estimate_status IN ('open', 'awaiting_approval', 'approved');

CREATE OR REPLACE FUNCTION maintenance.recompute_severe_repair_estimate_for_wo(p_wo_id uuid)
RETURNS void AS $$
DECLARE
  v_wo RECORD;
  v_severity text;
  v_labor_cents bigint := 0;
  v_parts_cents bigint := 0;
  v_outside_cents bigint := 0;
  v_open_count int := 0;
BEGIN
  SELECT
    w.id,
    w.operating_company_id,
    w.unit_id,
    lower(COALESCE(w.severity, '')) AS severity,
    lower(COALESCE(w.status, '')) AS status,
    w.repair_location,
    w.description,
    w.opened_at
  INTO v_wo
  FROM maintenance.work_orders w
  WHERE w.id = p_wo_id
  LIMIT 1;

  IF NOT FOUND OR v_wo.unit_id IS NULL THEN
    RETURN;
  END IF;

  IF v_wo.severity = 'out_of_service' THEN
    v_severity := 'out_of_service';
  ELSIF v_wo.severity = 'total_loss' THEN
    v_severity := 'total_loss';
  ELSE
    v_severity := 'severe';
  END IF;

  IF v_wo.severity NOT IN ('severe', 'out_of_service', 'total_loss')
     OR v_wo.status IN ('complete', 'completed', 'cancelled', 'closed', 'voided')
  THEN
    UPDATE maintenance.severe_repair_estimates
    SET estimate_status = CASE
          WHEN estimate_status IN ('open', 'awaiting_approval', 'approved') THEN 'completed'
          ELSE estimate_status
        END,
        refreshed_at = now(),
        updated_at = now()
    WHERE trigger_wo_id = p_wo_id;

    SELECT COUNT(*)::int
    INTO v_open_count
    FROM maintenance.severe_repair_estimates e
    WHERE e.unit_id = v_wo.unit_id
      AND e.estimate_status IN ('open', 'awaiting_approval', 'approved');

    IF v_open_count = 0 THEN
      UPDATE mdata.units
      SET is_oos = false,
          oos_since = NULL,
          oos_reason = NULL,
          oos_location = NULL
      WHERE id = v_wo.unit_id;
    END IF;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'labor' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint,
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'parts' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint,
    COALESCE(SUM(ROUND(CASE WHEN wl.line_type NOT IN ('labor', 'parts') THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint
  INTO v_labor_cents, v_parts_cents, v_outside_cents
  FROM maintenance.work_order_lines wl
  WHERE wl.work_order_id = p_wo_id;

  INSERT INTO maintenance.severe_repair_estimates (
    operating_company_id,
    unit_id,
    trigger_wo_id,
    damage_severity,
    estimate_status,
    estimate_location,
    estimated_labor_cents,
    estimated_parts_cents,
    estimated_outside_service_cents,
    description,
    estimated_completion_date,
    refreshed_at
  ) VALUES (
    v_wo.operating_company_id,
    v_wo.unit_id,
    v_wo.id,
    v_severity,
    'open',
    COALESCE(v_wo.repair_location, ''),
    v_labor_cents,
    v_parts_cents,
    v_outside_cents,
    LEFT(COALESCE(v_wo.description, ''), 500),
    NULL,
    now()
  )
  ON CONFLICT (operating_company_id, unit_id, trigger_wo_id) DO UPDATE
  SET damage_severity = EXCLUDED.damage_severity,
      estimate_status = CASE
        WHEN maintenance.severe_repair_estimates.estimate_status IN ('completed', 'rejected') THEN 'open'
        ELSE maintenance.severe_repair_estimates.estimate_status
      END,
      estimated_labor_cents = EXCLUDED.estimated_labor_cents,
      estimated_parts_cents = EXCLUDED.estimated_parts_cents,
      estimated_outside_service_cents = EXCLUDED.estimated_outside_service_cents,
      estimate_location = EXCLUDED.estimate_location,
      description = EXCLUDED.description,
      refreshed_at = now(),
      updated_at = now();

  UPDATE mdata.units
  SET is_oos = true,
      oos_since = COALESCE(oos_since, now()),
      oos_reason = COALESCE(oos_reason, v_severity || ' damage'),
      oos_location = COALESCE(oos_location, v_wo.repair_location)
  WHERE id = v_wo.unit_id
    AND is_oos = false;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION maintenance.upsert_severe_repair_estimate()
RETURNS trigger AS $$
BEGIN
  PERFORM maintenance.recompute_severe_repair_estimate_for_wo(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upsert_severe_repair_estimate ON maintenance.work_orders;
CREATE TRIGGER trg_upsert_severe_repair_estimate
  AFTER INSERT OR UPDATE OF severity, status, unit_id, repair_location, description
  ON maintenance.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.upsert_severe_repair_estimate();

CREATE OR REPLACE FUNCTION maintenance.refresh_severe_repair_estimate_from_line()
RETURNS trigger AS $$
DECLARE
  v_wo_id uuid;
BEGIN
  v_wo_id := COALESCE(NEW.work_order_id, OLD.work_order_id);
  IF v_wo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM maintenance.recompute_severe_repair_estimate_for_wo(v_wo_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_severe_repair_estimate_from_line ON maintenance.work_order_lines;
CREATE TRIGGER trg_refresh_severe_repair_estimate_from_line
  AFTER INSERT OR UPDATE OR DELETE
  ON maintenance.work_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.refresh_severe_repair_estimate_from_line();

CREATE OR REPLACE FUNCTION maintenance.unit_back_in_service_check()
RETURNS trigger AS $$
DECLARE
  v_remaining_open int;
BEGIN
  IF NEW.estimate_status NOT IN ('completed', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int
  INTO v_remaining_open
  FROM maintenance.severe_repair_estimates
  WHERE unit_id = NEW.unit_id
    AND estimate_status IN ('open', 'awaiting_approval', 'approved')
    AND id <> NEW.id;

  IF v_remaining_open = 0 THEN
    UPDATE mdata.units
    SET is_oos = false,
        oos_since = NULL,
        oos_reason = NULL,
        oos_location = NULL
    WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unit_back_in_service_check ON maintenance.severe_repair_estimates;
CREATE TRIGGER trg_unit_back_in_service_check
  AFTER UPDATE OF estimate_status
  ON maintenance.severe_repair_estimates
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.unit_back_in_service_check();

COMMIT;
