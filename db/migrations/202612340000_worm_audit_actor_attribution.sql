-- ACCT-F177 — the WORM audit trail records WHAT changed and never WHO. Fix the shared trigger.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (RLS-bypassed, RESET ROLE as its own statement):
--     audit.row_changes total ............................. 2,327,275
--     ... with changed_by_user_id ......................... 2        (0.0001%)
--     ... with changed_by_role ............................ 0
--     rows written in the last 7 days ..................... 266,994
--     ... of those, naming an actor ....................... 0
--
-- ROOT CAUSE, read from the deployed function body rather than inferred: `audit.tg_audit_row` resolves
-- the actor with
--     current_setting('app.user_id', true)
-- and the application NEVER SETS THAT KEY. A grep of every set_config in apps/backend/src returns
-- app.operating_company_id (820), app.bypass_rls (16), app.user_role (14),
-- app.current_operating_company_id (10), app.current_user_id (2), app.active_company_id (2) —
-- `app.user_id` appears ZERO times. The actor the rest of the system uses is `app.current_user_id`,
-- set by `withCurrentUser` (apps/backend/src/auth/db.ts:232), the single funnel every scoped route
-- transaction passes through. So the trigger has been reading a GUC nobody writes, for every row, since
-- the day it was installed. The two named rows are the exception that proves it.
--
-- The same file also explains the role column being 0 for 0: the trigger reads `app.user_role`, which
-- IS set — but only in 14 scattered route files, never in the transaction funnel. Attribution that
-- depends on each route remembering is attribution that does not exist.
--
-- WHY THIS IS ONE MIGRATION AND NOT A PER-TABLE SWEEP: `audit.tg_audit_row` is SECURITY DEFINER, owned
-- by neondb_owner, and is the function behind **39 triggers**. Correcting it names the actor on all 39
-- audited tables at once. There is nothing per-table to do.
--
-- WHAT THIS DOES NOT DO: the 2,327,273 existing NULL rows are WORM and are NOT backfilled. They cannot
-- honestly be — the actor was never captured, so any value written now would be invented. They stay
-- NULL and stay evidence that attribution began on this date. This is forward-looking by construction.

BEGIN;

CREATE OR REPLACE FUNCTION audit.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_source jsonb;
  v_tenant_text text;
  v_user_text text;
  v_tenant_id uuid;
  v_changed_by_user uuid;
  v_changed_by_role text;
  v_pk text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_source := to_jsonb(OLD);
  ELSE
    v_source := to_jsonb(NEW);
  END IF;

  -- G10-M: resolve the tenant from whichever company-scoping column the table actually carries.
  -- Order: explicit tenant_id first, then the mdata/asset variants. First UUID-shaped hit wins.
  v_tenant_text := COALESCE(
    v_source->>'tenant_id',
    v_source->>'operating_company_id',
    v_source->>'owner_company_id',
    v_source->>'default_company_id',
    v_source->>'company_id'
  );
  IF v_tenant_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_tenant_id := v_tenant_text::uuid;
  END IF;

  -- ACCT-F177 — read the key the application ACTUALLY sets, first.
  -- `app.current_user_id` is set by withCurrentUser on every scoped route transaction; `app.user_id`
  -- is kept as a fallback rather than dropped so that any writer already setting the legacy key (or a
  -- future one that does) is still attributed instead of silently regressing to NULL.
  v_user_text := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    NULLIF(current_setting('app.user_id', true), '')
  );
  IF v_user_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_changed_by_user := v_user_text::uuid;
  END IF;

  -- ACCT-F177 — role, with the GUC preferred and the user's own role as the fallback.
  -- The GUC wins when present because it records the role the actor was ACTING AS. It is set by only
  -- 14 route files though, so relying on it alone is what produced 0 named roles out of 2.3M. When it
  -- is absent we look the role up from the resolved actor — possible here, and only here, because this
  -- function is SECURITY DEFINER and owned by neondb_owner, so it reads identity.users regardless of
  -- the caller's RLS. One indexed primary-key lookup per audited row.
  v_changed_by_role := NULLIF(current_setting('app.user_role', true), '');
  IF v_changed_by_role IS NULL AND v_changed_by_user IS NOT NULL THEN
    SELECT u.role::text INTO v_changed_by_role
      FROM identity.users u
     WHERE u.id = v_changed_by_user;
  END IF;

  v_pk := COALESCE(v_source->>'id', v_source->>'uuid', md5(v_source::text));

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit.row_changes (
      tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'DELETE', v_pk, to_jsonb(OLD), NULL, v_changed_by_user,
      v_changed_by_role,
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit.row_changes (
      tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
    ) VALUES (
      v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'UPDATE', v_pk, to_jsonb(OLD), to_jsonb(NEW), v_changed_by_user,
      v_changed_by_role,
      NULLIF(current_setting('app.session_id', true), '')
    );
    RETURN NEW;
  END IF;

  INSERT INTO audit.row_changes (
    tenant_id, schema_name, table_name, op, row_pk, old_data, new_data, changed_by_user_id, changed_by_role, session_id
  ) VALUES (
    v_tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, 'INSERT', v_pk, NULL, to_jsonb(NEW), v_changed_by_user,
    v_changed_by_role,
    NULLIF(current_setting('app.session_id', true), '')
  );
  RETURN NEW;
END;
$fn$;

-- Idempotent by construction: CREATE OR REPLACE FUNCTION, no DDL on the audit table itself, and the
-- 39 existing triggers keep pointing at the same function OID. Nothing to guard with IF NOT EXISTS.

COMMIT;
