BEGIN;

CREATE TABLE IF NOT EXISTS safety.safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'closed')),
  kpi_bucket TEXT NOT NULL DEFAULT 'incidents' CHECK (kpi_bucket IN ('incidents', 'violations', 'claims', 'commendations')),
  subject_type TEXT NOT NULL DEFAULT 'company' CHECK (subject_type IN ('driver', 'unit', 'company')),
  subject_driver_id UUID NULL REFERENCES mdata.drivers(id),
  subject_unit_id UUID NULL REFERENCES mdata.units(id),
  related_load_id UUID NULL REFERENCES mdata.loads(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  description TEXT NULL,
  created_by UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety.safety_event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  safety_event_id UUID NOT NULL REFERENCES safety.safety_events(id) ON DELETE RESTRICT,
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_company_occurred
  ON safety.safety_events (operating_company_id, occurred_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_events_company_kpi
  ON safety.safety_events (operating_company_id, kpi_bucket, severity, status);

CREATE INDEX IF NOT EXISTS idx_safety_events_subject_driver
  ON safety.safety_events (operating_company_id, subject_driver_id)
  WHERE subject_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_events_subject_unit
  ON safety.safety_events (operating_company_id, subject_unit_id)
  WHERE subject_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_event_notes_company_event
  ON safety.safety_event_notes (operating_company_id, safety_event_id, created_at DESC);

CREATE OR REPLACE FUNCTION safety.block_safety_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.safety_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_events_block_update ON safety.safety_events;
CREATE TRIGGER trg_safety_events_block_update
  BEFORE UPDATE ON safety.safety_events
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_safety_events_mutation();

DROP TRIGGER IF EXISTS trg_safety_events_block_delete ON safety.safety_events;
CREATE TRIGGER trg_safety_events_block_delete
  BEFORE DELETE ON safety.safety_events
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_safety_events_mutation();

CREATE OR REPLACE FUNCTION safety.block_safety_event_notes_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.safety_event_notes is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_event_notes_block_update ON safety.safety_event_notes;
CREATE TRIGGER trg_safety_event_notes_block_update
  BEFORE UPDATE ON safety.safety_event_notes
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_safety_event_notes_mutation();

DROP TRIGGER IF EXISTS trg_safety_event_notes_block_delete ON safety.safety_event_notes;
CREATE TRIGGER trg_safety_event_notes_block_delete
  BEFORE DELETE ON safety.safety_event_notes
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_safety_event_notes_mutation();

ALTER TABLE safety.safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.safety_event_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_events_tenant_scope ON safety.safety_events;
CREATE POLICY safety_events_tenant_scope
  ON safety.safety_events
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS safety_event_notes_tenant_scope ON safety.safety_event_notes;
CREATE POLICY safety_event_notes_tenant_scope
  ON safety.safety_event_notes
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE UPDATE, DELETE ON safety.safety_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.safety_events FROM ih35_app;
REVOKE UPDATE, DELETE ON safety.safety_event_notes FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.safety_event_notes FROM ih35_app;

GRANT SELECT, INSERT ON safety.safety_events TO ih35_app;
GRANT SELECT, INSERT ON safety.safety_event_notes TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_safety_events ON safety.safety_events;
      CREATE TRIGGER tg_audit_safety_events
        AFTER INSERT OR UPDATE OR DELETE ON safety.safety_events
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

      DROP TRIGGER IF EXISTS tg_audit_safety_event_notes ON safety.safety_event_notes;
      CREATE TRIGGER tg_audit_safety_event_notes
        AFTER INSERT OR UPDATE OR DELETE ON safety.safety_event_notes
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;
