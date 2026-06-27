-- F2b — Add operating_company_id + company-isolation RLS policy to dispatch.intransit_issues.
--
-- Audit finding (2026-06-27): dispatch.intransit_issues has RLS enabled but only a
-- driver-self-rw policy. Office queries (arch-tabs, maintenance-triage, arriving-soon,
-- Samsara auto-switch) run as ih35_app with office roles and can read all-tenant rows
-- because the existing policy grants access to all office roles WITHOUT a company filter.
--
-- Fix:
--   1. Add operating_company_id column (derived from load's company on INSERT via trigger)
--   2. Backfill from mdata.loads for existing rows
--   3. Drop + recreate the RLS policy to require both role AND company match
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY + trigger are safe to re-run.

BEGIN;

-- ── 1. Add operating_company_id column ───────────────────────────────────────
ALTER TABLE dispatch.intransit_issues
  ADD COLUMN IF NOT EXISTS operating_company_id UUID REFERENCES org.companies(id);

-- ── 2. Backfill from parent load ─────────────────────────────────────────────
UPDATE dispatch.intransit_issues ii
SET operating_company_id = l.operating_company_id
FROM mdata.loads l
WHERE ii.load_id = l.id
  AND ii.operating_company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_intransit_issues_company
  ON dispatch.intransit_issues (operating_company_id);

-- ── 3. Trigger: auto-populate from load on INSERT ────────────────────────────
CREATE OR REPLACE FUNCTION dispatch.intransit_issues_set_company()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.operating_company_id IS NULL AND NEW.load_id IS NOT NULL THEN
    SELECT operating_company_id INTO NEW.operating_company_id
    FROM mdata.loads WHERE id = NEW.load_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intransit_issues_set_company ON dispatch.intransit_issues;
CREATE TRIGGER trg_intransit_issues_set_company
  BEFORE INSERT ON dispatch.intransit_issues
  FOR EACH ROW EXECUTE FUNCTION dispatch.intransit_issues_set_company();

-- ── 4. Replace RLS policy with company-isolation ─────────────────────────────
DROP POLICY IF EXISTS intransit_issues_driver_self_rw ON dispatch.intransit_issues;
CREATE POLICY intransit_issues_company_scope ON dispatch.intransit_issues
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      AND (
        identity.current_user_role() = ANY (
          ARRAY[
            'Owner'::identity.role_enum,
            'Administrator'::identity.role_enum,
            'Manager'::identity.role_enum,
            'Dispatcher'::identity.role_enum,
            'Mechanic'::identity.role_enum,
            'Safety'::identity.role_enum
          ]
        )
        OR driver_id = (
          SELECT d.id FROM mdata.drivers d
          WHERE d.identity_user_id = identity.current_user_id()
          LIMIT 1
        )
      )
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

COMMIT;
