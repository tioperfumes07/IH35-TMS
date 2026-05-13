-- P6-T11179 — Work order mandatory fields, service classification, costing, PDF support (additive).
-- Canonical maintenance WO table is maintenance.work_orders (legacy wo_type remains operational pm/repair/tire/accident).
-- wo_billing_type captures Jorge MVP internal vs external billing semantics.

BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE NOTICE 'Skipping 0145: maintenance.work_orders missing';
  ELSE
    ALTER TABLE maintenance.work_orders
      ADD COLUMN IF NOT EXISTS wo_billing_type TEXT,
      ADD COLUMN IF NOT EXISTS wo_service_class TEXT,
      ADD COLUMN IF NOT EXISTS vendor_work_order_number TEXT,
      ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER,
      ADD COLUMN IF NOT EXISTS actual_cost_cents INTEGER,
      ADD COLUMN IF NOT EXISTS labor_hours NUMERIC(6,2),
      ADD COLUMN IF NOT EXISTS parts_cost_cents INTEGER,
      ADD COLUMN IF NOT EXISTS shop_name TEXT,
      ADD COLUMN IF NOT EXISTS shop_address TEXT,
      ADD COLUMN IF NOT EXISTS shop_phone TEXT,
      ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS work_completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES identity.users(id),
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_by_user_id UUID REFERENCES identity.users(id),
      ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES identity.users(id),
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
      ADD COLUMN IF NOT EXISTS r2_photo_paths TEXT[],
      ADD COLUMN IF NOT EXISTS notes_internal TEXT,
      ADD COLUMN IF NOT EXISTS notes_to_vendor TEXT,
      ADD COLUMN IF NOT EXISTS linked_load_number TEXT;

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_billing_type;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_billing_type CHECK (
        wo_billing_type IS NULL OR wo_billing_type IN ('internal', 'external')
      );

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_service_class;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_service_class CHECK (
        wo_service_class IS NULL OR wo_service_class IN (
          'pm',
          'corrective',
          'accident',
          'inspection_dot',
          'inspection_state',
          'warranty',
          'other'
        )
      );

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_estimated_cost_cents;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_estimated_cost_cents CHECK (
        estimated_cost_cents IS NULL OR estimated_cost_cents >= 0
      );

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_actual_cost_cents;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_actual_cost_cents CHECK (
        actual_cost_cents IS NULL OR actual_cost_cents >= 0
      );

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_labor_hours;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_labor_hours CHECK (
        labor_hours IS NULL OR labor_hours >= 0
      );

    ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS chk_maintenance_wo_parts_cost_cents;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_parts_cost_cents CHECK (
        parts_cost_cents IS NULL OR parts_cost_cents >= 0
      );

    UPDATE maintenance.work_orders
    SET wo_billing_type = CASE
      WHEN bucket = 'in_house'::maintenance.wo_bucket_enum THEN 'internal'
      ELSE 'external'
    END
    WHERE wo_billing_type IS NULL;

    UPDATE maintenance.work_orders
    SET wo_service_class = CASE wo_type::text
      WHEN 'pm' THEN 'pm'
      WHEN 'repair' THEN 'corrective'
      WHEN 'accident' THEN 'accident'
      WHEN 'tire' THEN 'other'
      ELSE 'other'
    END
    WHERE wo_service_class IS NULL;

    UPDATE maintenance.work_orders
    SET vendor_work_order_number = COALESCE(vendor_work_order_number, external_vendor_wo_number)
    WHERE vendor_work_order_number IS NULL
      AND external_vendor_wo_number IS NOT NULL;

    UPDATE maintenance.work_orders
    SET linked_load_number = COALESCE(
      linked_load_number,
      (
        SELECT l.load_number
        FROM mdata.loads l
        WHERE l.id = maintenance.work_orders.load_id
        LIMIT 1
      )
    )
    WHERE linked_load_number IS NULL
      AND load_id IS NOT NULL;

  END IF;
END $$;

CREATE TABLE IF NOT EXISTS maintenance.work_order_seq_per_month (
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  year_month TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, year_month)
);

CREATE INDEX IF NOT EXISTS ix_work_orders_unit
  ON maintenance.work_orders(unit_id)
  WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_work_orders_driver
  ON maintenance.work_orders(driver_id)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_work_orders_status_company
  ON maintenance.work_orders(operating_company_id, status);

CREATE INDEX IF NOT EXISTS ix_work_orders_linked_load
  ON maintenance.work_orders(load_id)
  WHERE load_id IS NOT NULL;

COMMIT;
