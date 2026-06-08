-- GAP-38 / G15 / WF-027 — Damage Reports + Insurance Claims Continuity
-- ADDITIVE ONLY. Adapts the spec to the live schema:
--   * "damage reports" = safety.incidents WHERE incident_type = 'damage_report'
--     (there is no safety.damage_reports table; the canonical incidents table
--      is used per RBC decision documented in 0345_safety_incidents.sql).
--   * "insurance claims" = insurance.claim (cents, tenant_id, role ih35_app).
-- Conventions kept consistent with existing migrations:
--   gen_random_uuid(), role ih35_app, RLS via app.operating_company_id +
--   identity.is_lucia_bypass(), monetary values stored as integer cents.

BEGIN;

-- PIECE A.1 — continuity columns on safety.incidents (additive, idempotent)
ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS continuity_chain_id uuid,
  ADD COLUMN IF NOT EXISTS parent_incident_id uuid REFERENCES safety.incidents(id),
  ADD COLUMN IF NOT EXISTS auto_created_claim_id uuid,
  ADD COLUMN IF NOT EXISTS final_resolution_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_safety_incident_final_resolution_status'
  ) THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT chk_safety_incident_final_resolution_status
      CHECK (
        final_resolution_status IS NULL OR final_resolution_status IN (
          'open', 'claim_filed', 'claim_approved', 'claim_denied', 'self_paid', 'closed_no_action'
        )
      );
  END IF;
END
$$;

-- PIECE A.2 — continuity chain table (additive)
CREATE TABLE IF NOT EXISTS safety.damage_continuity_chains (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  initial_damage_id uuid NOT NULL REFERENCES safety.incidents(id),
  insurance_claim_id uuid,
  total_estimated_cost_cents bigint NOT NULL DEFAULT 0 CHECK (total_estimated_cost_cents >= 0),
  total_actual_cost_cents bigint NOT NULL DEFAULT 0 CHECK (total_actual_cost_cents >= 0),
  final_resolution_status text CHECK (
    final_resolution_status IS NULL OR final_resolution_status IN (
      'open', 'claim_filed', 'claim_approved', 'claim_denied', 'self_paid', 'closed_no_action'
    )
  ),
  chain_started_at timestamptz NOT NULL DEFAULT now(),
  chain_closed_at timestamptz,
  audit_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_continuity_chains_initial
  ON safety.damage_continuity_chains (initial_damage_id);
CREATE INDEX IF NOT EXISTS idx_damage_continuity_chains_company
  ON safety.damage_continuity_chains (operating_company_id, chain_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_continuity_chain
  ON safety.incidents (continuity_chain_id);

ALTER TABLE safety.damage_continuity_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.damage_continuity_chains FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS damage_continuity_chains_tenant_scope ON safety.damage_continuity_chains;
CREATE POLICY damage_continuity_chains_tenant_scope
  ON safety.damage_continuity_chains
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.damage_continuity_chains TO ih35_app;
GRANT SELECT, UPDATE ON safety.incidents TO ih35_app;

DROP TRIGGER IF EXISTS trg_damage_continuity_chains_updated_at ON safety.damage_continuity_chains;
CREATE TRIGGER trg_damage_continuity_chains_updated_at
  BEFORE UPDATE ON safety.damage_continuity_chains
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS safety.damage_continuity_chains;
-- ALTER TABLE safety.incidents
--   DROP CONSTRAINT IF EXISTS chk_safety_incident_final_resolution_status,
--   DROP COLUMN IF EXISTS continuity_chain_id,
--   DROP COLUMN IF EXISTS parent_incident_id,
--   DROP COLUMN IF EXISTS auto_created_claim_id,
--   DROP COLUMN IF EXISTS final_resolution_status;
