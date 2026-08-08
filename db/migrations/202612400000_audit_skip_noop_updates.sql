-- FAIL-A1 / ACCT-F255 — stop the audit trail recording UPDATEs that changed nothing.
--
-- `audit.row_changes` holds 1,035,579 rows for `accounting.bills` alone. Measured live on prod
-- br-fancy-credit-akjnd07a 2026-08-08, over a 3,000-row sample of bills UPDATE audit rows: the set of
-- columns whose value actually differed between old_data and new_data was
--
--     {last_qbo_synced_at, updated_at}     -- 3000 of 3000, no other combination occurs AT ALL
--
-- Every one of those rows is a QBO touch-write: the sync re-stamps when it last looked at the bill, the
-- `updated_at` trigger fires because a column was written, and the audit trigger faithfully records a
-- "change" in which no business field moved. A million rows of provenance for zero provenance.
--
-- WHY THIS IS A CORRECTNESS FIX AND NOT A CLEANUP. Volume is the symptom; the real cost is that the
-- audit trail stops being usable as evidence. "Show me who changed this bill" returns thousands of rows
-- that say nothing changed, and the handful that matter are indistinguishable inside them. An auditor,
-- attorney or DOT reviewer reading that cannot answer the question the table exists to answer. It also
-- makes the actor gap (the other half of FAIL-A1) far worse: NULL-actor noise rows swamp the real ones.
--
-- THE GUARD IS DELIBERATELY NARROW, because suppressing a WORM audit row is the dangerous direction.
-- A row is skipped ONLY when, after removing the two noise keys, old_data and new_data are BYTE-EQUAL
-- as jsonb. If ANY other column differs — one cent, one status, one FK, a column added tomorrow — the
-- jsonb comparison differs and the row is written exactly as before. It is not a list of "fields we
-- ignore"; it is "nothing else moved". INSERT and DELETE are untouched: those are never no-ops, and
-- void-not-delete means a DELETE is itself the event worth keeping.
--
-- NOT RETROACTIVE, on purpose. The 1,035,579 existing rows STAY. `audit.row_changes` is append-only and
-- ih35_app holds neither DELETE nor UPDATE on it (verified: both false) — deleting history to make a
-- table smaller is the exact thing the WORM law forbids, and this migration does not do it. This stops
-- the bleeding going forward; the existing volume is an owner decision about archival, not a defect to
-- silently erase.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. No schema change, no data change, no trigger re-attachment —
-- every existing `tg_audit_row` trigger picks up the new body automatically.

CREATE OR REPLACE FUNCTION audit.tg_audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_source jsonb;
  v_tenant_text text;
  v_user_text text;
  v_tenant_id uuid;
  v_changed_by_user uuid;
  v_changed_by_role text;
  v_pk text;
  -- ACCT-F255: columns that move on every touch-write and carry no business meaning on their own.
  v_noise_keys text[] := ARRAY['updated_at', 'last_qbo_synced_at'];
BEGIN
  -- ACCT-F255 — a no-op UPDATE is not an event. Strip the noise keys from BOTH sides and compare the
  -- whole remaining document; if it is unchanged, nothing happened worth recording. Placed before any
  -- other work so a touch-write costs one jsonb comparison instead of a row insert plus an
  -- identity.users lookup. Returns NEW so the UPDATE itself proceeds untouched — this suppresses the
  -- AUDIT row, never the write.
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) - v_noise_keys) IS NOT DISTINCT FROM (to_jsonb(NEW) - v_noise_keys) THEN
      RETURN NEW;
    END IF;
  END IF;

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
  -- FAIL-A1 — withLuciaBypass now sets `app.current_user_id` too when its caller supplies an actor, so
  -- bypass-path writes are attributable instead of uniformly NULL.
  v_user_text := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    NULLIF(current_setting('app.user_id', true), '')
  );
  IF v_user_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_changed_by_user := v_user_text::uuid;
  END IF;

  -- ACCT-F177 — role, with the GUC preferred and the user's own role as the fallback.
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
$function$;
