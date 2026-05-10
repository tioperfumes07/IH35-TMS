BEGIN;

CREATE SCHEMA IF NOT EXISTS integrations;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text,
  ADD COLUMN IF NOT EXISTS qbo_vendor_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS qbo_vendor_linked_by_user_id uuid REFERENCES identity.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdata_drivers_company_qbo_vendor_unique
  ON mdata.drivers (operating_company_id, qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mdata_drivers_qbo_vendor
  ON mdata.drivers (qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS qbo_class_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_units_qbo_class
  ON mdata.units (qbo_class_id)
  WHERE qbo_class_id IS NOT NULL;

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS qbo_class_id text;

CREATE INDEX IF NOT EXISTS idx_mdata_equipment_qbo_class
  ON mdata.equipment (qbo_class_id)
  WHERE qbo_class_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integrations.qbo_vendor_linkage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('driver', 'unit', 'equipment', 'asset')),
  entity_id uuid NOT NULL,
  qbo_vendor_id text,
  qbo_class_id text,
  previous_qbo_vendor_id text,
  previous_qbo_class_id text,
  action text NOT NULL CHECK (action IN ('linked', 'unlinked', 'changed', 'auto_suggested')),
  reason text NOT NULL,
  user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_vendor_linkage_events_company_entity
  ON integrations.qbo_vendor_linkage_events (operating_company_id, entity_type, entity_id, created_at DESC);

ALTER TABLE integrations.qbo_vendor_linkage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qbo_vendor_linkage_events_company_scope ON integrations.qbo_vendor_linkage_events;
CREATE POLICY qbo_vendor_linkage_events_company_scope
  ON integrations.qbo_vendor_linkage_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON integrations.qbo_vendor_linkage_events TO ih35_app;

COMMIT;
