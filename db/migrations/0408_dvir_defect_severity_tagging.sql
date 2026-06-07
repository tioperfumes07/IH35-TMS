-- GAP-49: DVIR defect severity tagging (major vs minor vs observation).
-- SOURCE: G18 master rule · WF-050 hard-block · 49 CFR §396.11 severity classes.
--
-- safety.dvir_defects (migration 0344) is APPEND-ONLY: an UPDATE/DELETE trigger
-- blocks mutation and UPDATE is REVOKEd from ih35_app, and its `severity` column
-- is constrained to ('minor','major').  Severity classification + Manager-level
-- overrides therefore CANNOT be modeled as in-place UPDATEs.  This migration is
-- ADDITIVE: it introduces an append-only audit table that records every severity
-- tag event (classifier output, driver selection, manager override) for a defect.
-- The effective severity for a defect is the most recent row (created_at DESC).

BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

-- Optional denormalized helper columns on the canonical defect row.
-- ADD COLUMN IF NOT EXISTS is safe additive DDL even on the append-only table.
ALTER TABLE safety.dvir_defects
  ADD COLUMN IF NOT EXISTS major_defect_code text;

CREATE INDEX IF NOT EXISTS idx_safety_dvir_defects_severity
  ON safety.dvir_defects (severity);

CREATE TABLE IF NOT EXISTS safety.dvir_defect_severity_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  dvir_defect_id uuid NOT NULL REFERENCES safety.dvir_defects(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('major', 'minor', 'observation')),
  major_defect_code text,
  source text NOT NULL CHECK (source IN ('classifier', 'driver', 'override')),
  routed boolean NOT NULL DEFAULT false,
  auto_wo_id uuid REFERENCES maintenance.work_orders(id),
  set_by_user_id uuid REFERENCES identity.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dvir_severity_tags_defect
  ON safety.dvir_defect_severity_tags (dvir_defect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dvir_severity_tags_company_severity
  ON safety.dvir_defect_severity_tags (operating_company_id, severity, created_at DESC);

-- Append-only: block UPDATE/DELETE so the override history can never be rewritten.
CREATE OR REPLACE FUNCTION safety.block_dvir_severity_tags_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.dvir_defect_severity_tags is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_dvir_severity_tags_block_update ON safety.dvir_defect_severity_tags;
CREATE TRIGGER trg_dvir_severity_tags_block_update
  BEFORE UPDATE ON safety.dvir_defect_severity_tags
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_dvir_severity_tags_mutation();

DROP TRIGGER IF EXISTS trg_dvir_severity_tags_block_delete ON safety.dvir_defect_severity_tags;
CREATE TRIGGER trg_dvir_severity_tags_block_delete
  BEFORE DELETE ON safety.dvir_defect_severity_tags
  FOR EACH ROW
  EXECUTE FUNCTION safety.block_dvir_severity_tags_mutation();

ALTER TABLE safety.dvir_defect_severity_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dvir_severity_tags_tenant_scope ON safety.dvir_defect_severity_tags;
CREATE POLICY dvir_severity_tags_tenant_scope
  ON safety.dvir_defect_severity_tags
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE UPDATE, DELETE ON safety.dvir_defect_severity_tags FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.dvir_defect_severity_tags FROM ih35_app;
GRANT SELECT, INSERT ON safety.dvir_defect_severity_tags TO ih35_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'tg_audit_row'
  ) THEN
    EXECUTE $sql$
      DROP TRIGGER IF EXISTS tg_audit_safety_dvir_severity_tags ON safety.dvir_defect_severity_tags;
      CREATE TRIGGER tg_audit_safety_dvir_severity_tags
        AFTER INSERT OR UPDATE OR DELETE ON safety.dvir_defect_severity_tags
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    $sql$;
  END IF;
END
$$;

COMMIT;

-- DOWN (manual rollback — run outside a transaction if needed):
-- DROP TRIGGER IF EXISTS tg_audit_safety_dvir_severity_tags ON safety.dvir_defect_severity_tags;
-- DROP TABLE IF EXISTS safety.dvir_defect_severity_tags;
-- DROP FUNCTION IF EXISTS safety.block_dvir_severity_tags_mutation();
-- DROP INDEX IF EXISTS safety.idx_safety_dvir_defects_severity;
-- ALTER TABLE safety.dvir_defects DROP COLUMN IF EXISTS major_defect_code;
