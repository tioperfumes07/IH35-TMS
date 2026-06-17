-- TIER-1 RLS fix: identity.is_lucia_bypass() must return a STRICT boolean, never NULL.
--
-- ROOT CAUSE (proven live via #1135 per-statement diagnostic, build b31b6b9):
--   POST /api/v1/mdata/equipment/:id/deactivate threw 42501 ExecWithCheckOptions on the UPDATE's
--   WITH CHECK. Probe on the failing connection: owner_company_id = leased_to = TRANSP, both in the
--   accessible set (NOT an entity-access problem); current_user_role() = 'Owner'; but
--   identity.is_lucia_bypass() = NULL (not false).
--
--   The body was `RETURN current_setting('app.bypass_rls', true) = 'lucia'`. The normal app pool never
--   sets app.bypass_rls (only the Lucia-bypass pool does), so current_setting('app.bypass_rls', true)
--   returns NULL, and `NULL = 'lucia'` is NULL in SQL three-valued logic — not false.
--
--   Every RLS policy of the form `is_lucia_bypass() OR <check>` then evaluates `NULL OR <check>`: when
--   <check> is not strictly TRUE, the predicate is NULL, and a WITH CHECK treats non-TRUE as a VIOLATION
--   -> 42501. This explains the asymmetry: company-scoped WITH CHECKs (customers/vendors/locations:
--   `is_lucia_bypass() OR operating_company_id IN (...)`) pass because the company branch is strictly
--   TRUE; role-scoped WITH CHECKs (equipment/units update: `is_lucia_bypass() OR current_user_role() =
--   ANY(...)`) reject when the role branch does not resolve to strict TRUE in the row-check context.
--
-- FIX: COALESCE to false so the function returns a strict boolean. This is a single CREATE OR REPLACE
--   that repairs EVERY policy referencing the helper (417 call-sites across 132 migrations) — no policy
--   rewrites. Idempotent. STABLE preserved. No GRANT/role change.

BEGIN;

CREATE OR REPLACE FUNCTION identity.is_lucia_bypass()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Strict boolean, never NULL. NULLIF guards the empty-string case; COALESCE guards the unset-GUC case.
  RETURN COALESCE(NULLIF(current_setting('app.bypass_rls', true), '') = 'lucia', false);
END;
$$;

COMMIT;
