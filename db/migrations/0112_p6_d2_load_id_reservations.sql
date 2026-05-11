BEGIN;

CREATE SCHEMA IF NOT EXISTS dispatch;

CREATE TABLE IF NOT EXISTS dispatch.load_id_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  reserved_load_number text NOT NULL,
  reserved_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'expired', 'cancelled')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reserved_load_number)
);

CREATE INDEX IF NOT EXISTS idx_load_id_reservations_status
  ON dispatch.load_id_reservations (operating_company_id, status, expires_at);

GRANT SELECT, INSERT, UPDATE ON dispatch.load_id_reservations TO ih35_app;
ALTER TABLE dispatch.load_id_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS load_id_reservations_select ON dispatch.load_id_reservations;
CREATE POLICY load_id_reservations_select ON dispatch.load_id_reservations
  FOR SELECT TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  );

DROP POLICY IF EXISTS load_id_reservations_write ON dispatch.load_id_reservations;
CREATE POLICY load_id_reservations_write ON dispatch.load_id_reservations
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    AND (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
      OR identity.is_lucia_bypass()
    )
  );

COMMIT;
