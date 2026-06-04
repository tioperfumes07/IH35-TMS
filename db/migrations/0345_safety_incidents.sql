-- Block A23-7: safety.incidents — damage reports, trailer interchanges, cargo claims
-- RBC decision: insurance.claim lacks cargo/damage typing; canonical incidents table with incident_type filter.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  incident_type text NOT NULL CHECK (
    incident_type IN ('damage_report', 'trailer_interchange', 'cargo_claim')
  ),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'closed')
  ),
  incident_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz NOT NULL DEFAULT now(),
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  driver_id uuid REFERENCES mdata.drivers(id),
  unit_id uuid REFERENCES mdata.units(id),
  trailer_id uuid REFERENCES mdata.units(id),
  load_id uuid REFERENCES mdata.loads(id),
  interchange_party text,
  damage_amount_cents bigint NOT NULL DEFAULT 0 CHECK (damage_amount_cents >= 0),
  photo_keys text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_safety_incident_photo_keys_max CHECK (cardinality(photo_keys) <= 10)
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_company_type
  ON safety.incidents (operating_company_id, incident_type, incident_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_company_status
  ON safety.incidents (operating_company_id, status);

ALTER TABLE safety.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_incidents_tenant_scope ON safety.incidents;
CREATE POLICY safety_incidents_tenant_scope
  ON safety.incidents
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.incidents TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_safety_incidents ON safety.incidents;
      CREATE TRIGGER tg_audit_safety_incidents
        AFTER INSERT OR UPDATE OR DELETE ON safety.incidents
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS safety.incidents;
