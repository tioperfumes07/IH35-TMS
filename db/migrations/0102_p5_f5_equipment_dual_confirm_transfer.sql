BEGIN;

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES mdata.drivers(id);

CREATE TABLE IF NOT EXISTS mdata.equipment_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id),
  from_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  to_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  transfer_location text,
  status text NOT NULL DEFAULT 'pending_to_confirm' CHECK (status IN ('pending_to_confirm', 'confirmed', 'rejected', 'cancelled', 'expired')),
  initiated_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_driver_id <> to_driver_id)
);

ALTER TABLE mdata.equipment_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_equipment_transfers_isolation
  ON mdata.equipment_transfers;
CREATE POLICY rls_equipment_transfers_isolation
  ON mdata.equipment_transfers
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_equip_transfer_to_driver_pending
  ON mdata.equipment_transfers (to_driver_id, status)
  WHERE status = 'pending_to_confirm';
CREATE INDEX IF NOT EXISTS idx_equip_transfer_equipment
  ON mdata.equipment_transfers (equipment_id, initiated_at DESC);

COMMIT;
