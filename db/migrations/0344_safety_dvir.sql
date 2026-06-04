-- Block A23-4: safety.dvir_submissions + safety.dvir_defects (WF-050 foundation)
-- Reversible: see DOWN section at end of file.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.dvir_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id uuid REFERENCES mdata.loads(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  trailer_id uuid REFERENCES mdata.units(id),
  type text NOT NULL CHECK (type IN ('pre_trip', 'post_trip')),
  odometer int NOT NULL,
  location text NOT NULL,
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  items jsonb NOT NULL,
  certified boolean NOT NULL DEFAULT false,
  signature_data_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  has_major_defect boolean NOT NULL DEFAULT false,
  has_any_defect boolean NOT NULL DEFAULT false,
  client_request_id text,
  corrects_dvir_id uuid REFERENCES safety.dvir_submissions(id),
  follow_up_wo_id uuid REFERENCES maintenance.work_orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_safety_dvir_client_request
  ON safety.dvir_submissions (operating_company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_dvir_company_submitted
  ON safety.dvir_submissions (operating_company_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_dvir_driver_load
  ON safety.dvir_submissions (driver_id, load_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_dvir_unit
  ON safety.dvir_submissions (unit_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS safety.dvir_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  dvir_submission_id uuid NOT NULL REFERENCES safety.dvir_submissions(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  item_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'major')),
  notes text NOT NULL DEFAULT '',
  photo_keys text[] NOT NULL DEFAULT '{}',
  follow_up_wo_id uuid REFERENCES maintenance.work_orders(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_safety_dvir_defect_photo_keys_max CHECK (cardinality(photo_keys) <= 5)
);

CREATE INDEX IF NOT EXISTS idx_safety_dvir_defects_submission
  ON safety.dvir_defects (dvir_submission_id);

CREATE INDEX IF NOT EXISTS idx_safety_dvir_defects_unit_open
  ON safety.dvir_defects (unit_id)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION safety.block_dvir_submissions_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.dvir_submissions is append-only — DELETE is not allowed';
END;
$$;

CREATE OR REPLACE FUNCTION safety.block_dvir_defects_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.dvir_defects is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_dvir_submissions_block_delete ON safety.dvir_submissions;
CREATE TRIGGER trg_safety_dvir_submissions_block_delete
  BEFORE DELETE ON safety.dvir_submissions
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_dvir_submissions_delete();

DROP TRIGGER IF EXISTS trg_safety_dvir_defects_block_update ON safety.dvir_defects;
CREATE TRIGGER trg_safety_dvir_defects_block_update
  BEFORE UPDATE ON safety.dvir_defects
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_dvir_defects_mutation();

DROP TRIGGER IF EXISTS trg_safety_dvir_defects_block_delete ON safety.dvir_defects;
CREATE TRIGGER trg_safety_dvir_defects_block_delete
  BEFORE DELETE ON safety.dvir_defects
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_dvir_defects_mutation();

ALTER TABLE safety.dvir_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.dvir_defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_dvir_submissions_tenant_scope ON safety.dvir_submissions;
CREATE POLICY safety_dvir_submissions_tenant_scope
  ON safety.dvir_submissions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS safety_dvir_defects_tenant_scope ON safety.dvir_defects;
CREATE POLICY safety_dvir_defects_tenant_scope
  ON safety.dvir_defects
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE DELETE ON safety.dvir_submissions FROM PUBLIC;
REVOKE DELETE ON safety.dvir_submissions FROM ih35_app;
REVOKE UPDATE, DELETE ON safety.dvir_defects FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.dvir_defects FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON safety.dvir_submissions TO ih35_app;
GRANT SELECT, INSERT ON safety.dvir_defects TO ih35_app;

COMMENT ON TABLE maintenance.dvir_submissions IS
  '@deprecated Sunset 2026-09-01 — use safety.dvir_submissions (migration 0344, Block A23-4). ARCHIVE-not-DELETE.';
COMMENT ON TABLE maintenance.defects IS
  '@deprecated Sunset 2026-09-01 — use safety.dvir_defects (migration 0344, Block A23-4). ARCHIVE-not-DELETE.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_safety_dvir_submissions ON safety.dvir_submissions;
      CREATE TRIGGER tg_audit_safety_dvir_submissions
        AFTER INSERT OR UPDATE OR DELETE ON safety.dvir_submissions
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

      DROP TRIGGER IF EXISTS tg_audit_safety_dvir_defects ON safety.dvir_defects;
      CREATE TRIGGER tg_audit_safety_dvir_defects
        AFTER INSERT OR UPDATE OR DELETE ON safety.dvir_defects
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback — run outside transaction if needed):
-- DROP TRIGGER IF EXISTS tg_audit_safety_dvir_defects ON safety.dvir_defects;
-- DROP TRIGGER IF EXISTS tg_audit_safety_dvir_submissions ON safety.dvir_submissions;
-- DROP TABLE IF EXISTS safety.dvir_defects;
-- DROP TABLE IF EXISTS safety.dvir_submissions;
-- DROP FUNCTION IF EXISTS safety.block_dvir_defects_mutation();
-- DROP FUNCTION IF EXISTS safety.block_dvir_submissions_delete();
