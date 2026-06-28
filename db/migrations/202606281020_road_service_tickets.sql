-- CLOSURE-7 P5-T17 — road service tickets linked to maintenance WO + vendor bill (additive).
BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.road_service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  ticket_number text NOT NULL,
  vendor_name text NOT NULL,
  vendor_id uuid REFERENCES mdata.qbo_vendors(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid REFERENCES mdata.drivers(id),
  dispatcher_user_id uuid REFERENCES identity.users(id),
  call_time timestamptz,
  on_scene_time timestamptz,
  completed_time timestamptz,
  location_address text,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  service_type text NOT NULL CHECK (
    service_type IN ('tire_change', 'jump_start', 'fuel_delivery', 'lockout', 'tow', 'other')
  ),
  initial_complaint text,
  work_performed text,
  parts_used text,
  total_cost_cents bigint NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  payment_method text NOT NULL DEFAULT 'vendor_bill' CHECK (
    payment_method IN ('vendor_bill', 'driver_advance', 'cc')
  ),
  attached_doc_ids uuid[],
  wo_id uuid REFERENCES maintenance.work_orders(id),
  bill_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'invoiced', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_road_service_tickets_company_status
  ON maintenance.road_service_tickets (operating_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_road_service_tickets_unit
  ON maintenance.road_service_tickets (operating_company_id, unit_id, created_at DESC);

ALTER TABLE maintenance.road_service_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS road_service_tickets_tenant_scope ON maintenance.road_service_tickets;
CREATE POLICY road_service_tickets_tenant_scope ON maintenance.road_service_tickets
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.road_service_tickets TO ih35_app;

COMMIT;
