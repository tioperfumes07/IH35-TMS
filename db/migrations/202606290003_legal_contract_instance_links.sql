-- ============================================================================
-- 202606290003_legal_contract_instance_links.sql
-- Legal full-build — PHASE 1 (additive, self-contained, fresh-DB-safe).
--
-- Adds legal.contract_instance_links: the generic, auditable join from a signed
-- contract instance to any operational/financial record (driver, employee,
-- customer, unit, matter, deduction_schedule, fixed_asset, dq_file). This is the
-- Option-B "handoff" surface (see docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-
-- READINESS.md + docs/lockdown/00_LOCKED_DECISIONS.md §6.5): Legal writes the
-- link + emits the handoff; Finance (FIN-18/FIN-22) owns any money-math/GL.
--
-- New table only. No ALTER on existing legal tables. Per-entity, opco-scoped RLS
-- (ENABLE + FORCE, matching the legal tail forced by #1636). Explicit GRANTs +
-- DEFAULT PRIVILEGES so it works on a fresh CI DB and at runtime (ih35_app).
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). void-not-delete: is_active
-- toggles a link; links to a signed contract are evidence and are never deleted.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS legal.contract_instance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contract_instance_id uuid NOT NULL REFERENCES legal.contract_instances(id) ON DELETE RESTRICT,
  link_type text NOT NULL CHECK (link_type IN (
    'driver',
    'employee',
    'customer',
    'unit',
    'matter',
    'deduction_schedule',
    'fixed_asset',
    'dq_file'
  )),
  target_schema text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One logical link per (instance, link_type, target). Re-linking reactivates
-- via ON CONFLICT DO UPDATE SET is_active = true in app code (never duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_contract_instance_links_natural
  ON legal.contract_instance_links (contract_instance_id, link_type, target_id);

-- Forward lookup: all links for a given signed contract instance.
CREATE INDEX IF NOT EXISTS idx_legal_contract_instance_links_instance
  ON legal.contract_instance_links (contract_instance_id, link_type);

-- Reverse lookup (drill-through): "what signed contracts touch this record?"
CREATE INDEX IF NOT EXISTS idx_legal_contract_instance_links_target
  ON legal.contract_instance_links (operating_company_id, link_type, target_id)
  WHERE is_active = true;

ALTER TABLE legal.contract_instance_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.contract_instance_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_legal_contract_instance_links_isolation ON legal.contract_instance_links;
CREATE POLICY rls_legal_contract_instance_links_isolation ON legal.contract_instance_links
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- Grants (fresh-DB-safe; schema legal already exists from 0126).
DO $$
BEGIN
  IF to_regnamespace('legal') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA legal TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON legal.contract_instance_links TO ih35_app;
  END IF;
END
$$;

COMMIT;
