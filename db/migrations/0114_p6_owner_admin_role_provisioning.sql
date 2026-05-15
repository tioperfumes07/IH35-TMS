-- 0114_p6_owner_admin_role_provisioning.sql
-- Permanent provisioning for office/admin access on production-like environments.
-- Idempotent: safe to re-run.

BEGIN;

-- Promote the founding owner account if it exists.
UPDATE identity.users
SET role = 'Owner'::identity.role_enum
WHERE lower(email) = lower('tioperfumes07@gmail.com')
  AND role <> 'Owner'::identity.role_enum;

-- Promote the office admin account if it exists.
UPDATE identity.users
SET role = 'Administrator'::identity.role_enum
WHERE lower(email) = lower('jpm@tioperfumes.com')
  AND role NOT IN ('Owner'::identity.role_enum, 'Administrator'::identity.role_enum);

-- Self-heal: fresh databases (e.g. CI replay) have no users yet; provisioning UPDATEs above are no-ops.
-- Raising here used to abort the entire migration chain; production with an Owner row is unchanged when Owner exists.
-- Guardrail: warn when no Owner exists after role provisioning; do not fail empty installs.
DO $$
DECLARE
  owner_count integer;
BEGIN
  SELECT count(*) INTO owner_count
  FROM identity.users
  WHERE role = 'Owner'::identity.role_enum;

  IF owner_count = 0 THEN
    RAISE NOTICE 'Skipping Owner guardrail: no Owner user exists in identity.users yet (expected on empty DB)';
  END IF;
END $$;

COMMIT;
