-- 202615180100_fleet_roster_findings.sql
-- ROUND 313 CC-1 #1 — E-17 FLEET ROSTER INTEGRITY. One row per mismatch between mdata.units and the systems
-- that must agree with it: Samsara (integrations.samsara_vehicles), the insurance schedule
-- (insurance.policy_unit -> mdata.assets.unit_id -> insurance.policy), IRP registration (mdata.units.irp_*)
-- and the lease (owner_company_id / currently_leased_to_company_id vs the entity actually running the truck).
-- Written only by the roster engine (apps/backend/src/fleet/roster-integrity.service.ts). A finding the engine
-- no longer detects is RESOLVED (resolved_at), never deleted; a person may VOID one with a reason. No DELETE grant.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS fleet;
GRANT USAGE ON SCHEMA fleet TO ih35_app;

CREATE TABLE IF NOT EXISTS fleet.roster_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  rule_code text NOT NULL CHECK (rule_code IN (
    'SAMSARA_UNLINKED', 'SAMSARA_STALE', 'SAMSARA_VIN_MISMATCH', 'SAMSARA_ORPHAN',
    'SAMSARA_REPORTS_FOR_DEACTIVATED_UNIT', 'SAMSARA_OPCO_MISMATCH',
    'INSURANCE_NOT_SCHEDULED', 'INSURANCE_POLICY_EXPIRED', 'INSURANCE_ON_DEACTIVATED_UNIT', 'INSURANCE_ASSET_UNLINKED',
    'IRP_MISSING', 'IRP_EXPIRED', 'LEASE_ENTITY_MISMATCH', 'VEHICLE_TYPE_UNCLASSIFIED')),
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  finding_key text NOT NULL,
  unit_id uuid REFERENCES mdata.units(id),
  samsara_vehicle_id text,
  policy_id uuid REFERENCES insurance.policy(id),
  asset_id uuid REFERENCES mdata.assets(id),
  detail text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  voided_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_findings_void_needs_reason CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND btrim(void_reason) <> ''))
);

-- One OPEN finding per company per key; resolved/voided history stays.
CREATE UNIQUE INDEX IF NOT EXISTS roster_findings_one_open_per_key
  ON fleet.roster_findings (operating_company_id, finding_key)
  WHERE resolved_at IS NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS roster_findings_unit ON fleet.roster_findings (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roster_findings_created ON fleet.roster_findings (operating_company_id, created_at DESC);

ALTER TABLE fleet.roster_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.roster_findings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roster_findings_company_isolation ON fleet.roster_findings;
CREATE POLICY roster_findings_company_isolation ON fleet.roster_findings
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON fleet.roster_findings TO ih35_app;

COMMENT ON TABLE fleet.roster_findings IS
  'E-17 fleet roster integrity: one row per unit/Samsara/insurance/IRP/lease mismatch. Resolved when no longer detected; voided with a reason; never deleted.';

COMMIT;
