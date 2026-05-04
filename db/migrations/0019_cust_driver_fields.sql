BEGIN;

-- 1A. Customer enums and columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'customer_type'
      AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.customer_type AS ENUM ('broker', 'direct_shipper');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'miles_basis'
      AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.miles_basis AS ENUM ('short_miles', 'practical_miles');
  END IF;
END $$;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS customer_type mdata.customer_type,
  ADD COLUMN IF NOT EXISTS default_billing_miles_basis mdata.miles_basis NOT NULL DEFAULT 'practical_miles',
  ADD COLUMN IF NOT EXISTS default_free_time_hours numeric(5, 2) NOT NULL DEFAULT 4.0 CHECK (default_free_time_hours >= 0),
  ADD COLUMN IF NOT EXISTS default_detention_rate numeric(10, 2) NOT NULL DEFAULT 50.00 CHECK (default_detention_rate >= 0);

COMMENT ON COLUMN mdata.customers.customer_type IS 'Broker (pays per load through brokerage) or direct_shipper (direct relationship with shipper). Used for profitability and lane analysis reports.';
COMMENT ON COLUMN mdata.customers.default_billing_miles_basis IS 'Default mileage basis used to bill this customer. Practical_miles is industry norm. Per-load override possible in dispatch.';
COMMENT ON COLUMN mdata.customers.default_free_time_hours IS 'Free time before detention starts. Negotiated per customer. Default 4 hours. Per-load override possible.';
COMMENT ON COLUMN mdata.customers.default_detention_rate IS 'Detention pay per hour after free time. Negotiated per customer. Default $50/hr. Per-load override possible. Decision to charge happens at invoice generation in Phase 5.';

-- 1B. Driver pay basis
ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS pay_basis mdata.miles_basis NOT NULL DEFAULT 'short_miles';

COMMENT ON COLUMN mdata.drivers.pay_basis IS 'Mileage basis used to compute driver settlement pay. Short_miles is industry norm. Practical_miles can be negotiated per driver.';

-- 1C. Add initial_hire to pay_rate_change_reason enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'pay_rate_change_reason'
      AND n.nspname = 'mdata'
      AND e.enumlabel = 'initial_hire'
  ) THEN
    ALTER TYPE mdata.pay_rate_change_reason ADD VALUE IF NOT EXISTS 'initial_hire' BEFORE 'raise';
  END IF;
END $$;

-- 1D. Driver load statuses catalog
CREATE TABLE IF NOT EXISTS catalogs.driver_load_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  phase text NOT NULL CHECK (
    phase IN (
      'pickup',
      'transit_to_pickup',
      'at_pickup',
      'transit_to_delivery',
      'at_delivery',
      'completed',
      'other'
    )
  ),
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS idx_driver_load_statuses_phase
  ON catalogs.driver_load_statuses (phase, sort_order)
  WHERE deactivated_at IS NULL;

COMMENT ON TABLE catalogs.driver_load_statuses IS 'Catalog of statuses a driver can be in for a load. Used by Phase 3 trips/stops. Admin-editable.';
COMMENT ON COLUMN catalogs.driver_load_statuses.phase IS 'High-level phase grouping: pickup phase, in-transit, at delivery, etc.';

GRANT SELECT, INSERT, UPDATE ON catalogs.driver_load_statuses TO ih35_app;
ALTER TABLE catalogs.driver_load_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.driver_load_statuses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dls_select_all ON catalogs.driver_load_statuses;
CREATE POLICY dls_select_all ON catalogs.driver_load_statuses
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS dls_insert_admin ON catalogs.driver_load_statuses;
CREATE POLICY dls_insert_admin ON catalogs.driver_load_statuses
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS dls_update_admin ON catalogs.driver_load_statuses;
CREATE POLICY dls_update_admin ON catalogs.driver_load_statuses
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS dls_lucia_bypass ON catalogs.driver_load_statuses;
CREATE POLICY dls_lucia_bypass ON catalogs.driver_load_statuses
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

INSERT INTO catalogs.driver_load_statuses (code, name, phase, sort_order, description) VALUES
  ('EN_ROUTE_TO_PICKUP', 'En route to pickup', 'transit_to_pickup', 10, 'Driver dispatched and traveling toward pickup location'),
  ('ARRIVED_AT_PICKUP', 'Arrived at pickup', 'at_pickup', 20, 'Driver has arrived at the pickup location'),
  ('CHECKED_IN_AT_PICKUP', 'Checked in (at pickup)', 'at_pickup', 30, 'Driver has checked in at the shipper office or guard'),
  ('BEING_LOADED', 'Being loaded', 'at_pickup', 40, 'Trailer is being loaded by shipper'),
  ('LOADED_AWAITING_BOL', 'Loaded, awaiting paperwork/BOL', 'at_pickup', 50, 'Loading complete, waiting for bill of lading and seal'),
  ('DEPARTED_PICKUP', 'Departed pickup', 'transit_to_delivery', 60, 'Driver has departed the pickup location'),
  ('EN_ROUTE_TO_DELIVERY', 'En route to delivery', 'transit_to_delivery', 70, 'Driver in transit toward delivery location'),
  ('ARRIVED_AT_DELIVERY', 'Arrived at delivery', 'at_delivery', 80, 'Driver has arrived at the delivery location'),
  ('CHECKED_IN_AT_DELIVERY', 'Checked in (at delivery)', 'at_delivery', 90, 'Driver has checked in at the receiver office or guard'),
  ('BEING_UNLOADED', 'Being unloaded', 'at_delivery', 100, 'Trailer is being unloaded by receiver'),
  ('UNLOADED_AWAITING_BOL', 'Unloaded, awaiting paperwork', 'at_delivery', 110, 'Unloading complete, waiting for signed POD'),
  ('DEPARTED_DELIVERY', 'Departed delivery', 'completed', 120, 'Driver has departed the delivery location, load complete'),
  ('OTHER_WITH_NOTES', 'Other (with notes)', 'other', 130, 'Custom status - driver must include notes')
ON CONFLICT (code) DO NOTHING;

COMMIT;
