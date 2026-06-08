-- Block 15 of 29 — TIER2.5-MECHANIC-SHOP — Internal Mechanic Shop
-- Creates maintenance.internal_labor_log (parts_inventory already exists)
BEGIN;

-- ─── Internal Labor Log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance.internal_labor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tenant_id uuid NOT NULL REFERENCES org.companies(id),
  work_order_id uuid NOT NULL REFERENCES maintenance.work_orders(id) ON DELETE CASCADE,
  mechanic_user_id uuid REFERENCES identity.users(id),
  mechanic_employee_id uuid,
  unit_id uuid NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  hours numeric(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN end_time IS NOT NULL
      THEN round(extract(epoch FROM (end_time - start_time)) / 3600.0, 2)
      ELSE NULL
    END
  ) STORED,
  hourly_rate_cents bigint NOT NULL CHECK (hourly_rate_cents >= 0),
  labor_cost_cents bigint NOT NULL GENERATED ALWAYS AS (
    CASE
      WHEN end_time IS NOT NULL
      THEN round(
        extract(epoch FROM (end_time - start_time)) / 3600.0
        * hourly_rate_cents
      )::bigint
      ELSE 0
    END
  ) STORED,
  parts_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_parts_cost_cents bigint NOT NULL DEFAULT 0 CHECK (total_parts_cost_cents >= 0),
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (operating_company_id = tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_labor_log_wo
  ON maintenance.internal_labor_log (work_order_id);

CREATE INDEX IF NOT EXISTS idx_internal_labor_log_mechanic_start
  ON maintenance.internal_labor_log (mechanic_user_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_internal_labor_log_unit
  ON maintenance.internal_labor_log (unit_id, start_time DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON maintenance.internal_labor_log TO ih35_app;

ALTER TABLE maintenance.internal_labor_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'internal_labor_log'
      AND schemaname = 'maintenance'
      AND policyname = 'internal_labor_log_tenant_isolation'
  ) THEN
    CREATE POLICY internal_labor_log_tenant_isolation
      ON maintenance.internal_labor_log
      USING (tenant_id = current_setting('app.operating_company_id', true)::uuid);
  END IF;
END $$;

-- ─── Updated-at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION maintenance.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'internal_labor_log_updated_at'
  ) THEN
    CREATE TRIGGER internal_labor_log_updated_at
      BEFORE UPDATE ON maintenance.internal_labor_log
      FOR EACH ROW EXECUTE FUNCTION maintenance.set_updated_at();
  END IF;
END $$;

-- ─── Reorder point alert function ─────────────────────────────────────────────
-- Function called after parts inventory decrements; logs alert if below reorder point
CREATE OR REPLACE FUNCTION maintenance.check_parts_reorder_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.on_hand_qty IS NOT NULL
     AND NEW.reorder_point IS NOT NULL
     AND NEW.on_hand_qty <= NEW.reorder_point
     AND (OLD.on_hand_qty IS NULL OR OLD.on_hand_qty > OLD.reorder_point) THEN
    RAISE NOTICE 'REORDER ALERT: part % (%) is at or below reorder point (qty=%, reorder=%)',
      NEW.id, NEW.part_description, NEW.on_hand_qty, NEW.reorder_point;
    -- Insert into audit log if the table exists (observability hook, non-fatal)
    IF to_regclass('public.audit_log') IS NOT NULL THEN
      INSERT INTO audit_log (
        table_name, record_id, action, changed_by, change_data
      ) VALUES (
        'maintenance.parts_inventory',
        NEW.id,
        'REORDER_ALERT',
        current_setting('app.current_user_id', true),
        jsonb_build_object(
          'part_description', NEW.part_description,
          'on_hand_qty', NEW.on_hand_qty,
          'reorder_point', NEW.reorder_point,
          'alert_type', 'below_reorder_point'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'parts_inventory_reorder_check'
  ) THEN
    CREATE TRIGGER parts_inventory_reorder_check
      AFTER UPDATE OF on_hand_qty ON maintenance.parts_inventory
      FOR EACH ROW EXECUTE FUNCTION maintenance.check_parts_reorder_alert();
  END IF;
END $$;

COMMIT;
