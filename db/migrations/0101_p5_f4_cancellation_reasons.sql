BEGIN;

-- Self-heal: migration 0062 once created catalogs.cancellation_reasons as a generic company-scoped catalog
-- (columns: code, display_name, …). Migration 0101 expects a global table keyed by reason_code.
-- CREATE TABLE IF NOT EXISTS would silently skip and leave the wrong shape → FK reason_code fails.
DO $$
BEGIN
  IF to_regclass('catalogs.cancellation_reasons') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'catalogs'
        AND table_name = 'cancellation_reasons'
        AND column_name = 'reason_code'
    ) THEN
      EXECUTE 'ALTER TABLE catalogs.cancellation_reasons RENAME TO cancellation_reasons_company_catalog_legacy';
      RAISE NOTICE 'Renamed 0062 generic catalogs.cancellation_reasons stub to cancellation_reasons_company_catalog_legacy';
    END IF;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS catalogs.cancellation_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_code text UNIQUE NOT NULL,
  reason_label text NOT NULL,
  billable_to_customer_default boolean NOT NULL DEFAULT false,
  requires_owner_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO catalogs.cancellation_reasons
  (reason_code, reason_label, billable_to_customer_default, requires_owner_approval, sort_order)
VALUES
  ('CUSTOMER_CANCELLED', 'Customer Cancelled', true,  false, 10),
  ('DRIVER_ISSUE', 'Driver Issue', false, true, 20),
  ('EQUIPMENT_ISSUE', 'Equipment Issue', false, false, 30),
  ('WEATHER', 'Weather', false, false, 40),
  ('NO_PICKUP', 'No Pickup Available', false, false, 50),
  ('RATE_DISPUTE', 'Rate Dispute', false, true, 60),
  ('CUSTOMER_BANKRUPTCY', 'Customer Bankruptcy', false, true, 70),
  ('TRUCK_BREAKDOWN', 'Truck Breakdown', false, false, 80),
  ('DRIVER_WALKOFF', 'Driver Walkoff', false, true, 90)
ON CONFLICT (reason_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS dispatch.load_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  reason_code text NOT NULL REFERENCES catalogs.cancellation_reasons(reason_code),
  cancellation_notes text NOT NULL CHECK (length(trim(cancellation_notes)) >= 20),
  billable_to_customer boolean NOT NULL DEFAULT false,
  cancellation_charge_cents bigint,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  cancelled_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  approved_by_user_id uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_id)
);

ALTER TABLE dispatch.load_cancellations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_load_cancellations_isolation
  ON dispatch.load_cancellations;
CREATE POLICY rls_load_cancellations_isolation
  ON dispatch.load_cancellations
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_load_cancellations_company
  ON dispatch.load_cancellations (operating_company_id, cancelled_at DESC);

COMMIT;
