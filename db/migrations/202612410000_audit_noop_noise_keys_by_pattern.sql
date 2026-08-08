-- ACCT-F259 — my own ACCT-F255 no-op guard was 0.8% effective. Hard-coding column names was the bug.
--
-- 202612400000 skipped an UPDATE audit row when, after removing ARRAY['updated_at',
-- 'last_qbo_synced_at'], old and new were byte-equal. I measured that list on ONE table — accounting.bills
-- — and shipped it as if it generalised. It does not:
--
--   accounting.*        uses  last_qbo_synced_at   -> suppressed, which is why it LOOKED fixed
--   mdata.vendors       uses  qbo_synced_at        -> nothing stripped, every touch-write recorded
--   mdata.customers     uses  qbo_synced_at        -> same
--   banking.bank_transactions uses qbo_synced_at   -> same
--
-- Measured live after 202612400000 deployed: 1,774 of 1,794 no-op UPDATEs still recorded. `bills` took 0
-- new rows (working) while `customers` took 1,246 and `vendors` 528 (untouched). On both, 300 of 300
-- sampled rows differed ONLY in {qbo_synced_at, updated_at}. The guard was inert exactly where it was
-- not measured.
--
-- THE REAL DEFECT IS THE HARD-CODED LIST, NOT THE MISSING NAME. Adding 'qbo_synced_at' would fix today
-- and re-open the moment a fifth spelling appears — silently, with the guard still reporting success.
-- So the noise set is now DERIVED PER ROW from the document itself:
--
--     key = 'updated_at'  OR  key LIKE '%\_synced\_at'
--
-- WHY THE UNDERSCORE IN THE PATTERN IS DELIBERATE, and it encodes a judgement rather than dodging it:
-- `%\_synced\_at` matches last_qbo_synced_at, qbo_synced_at and last_synced_at — every sync stamp on
-- every audited table, and any future one — but does NOT match a bare `synced_at`. That column exists on
-- integrations.qbo_sync_queue, where "when did this queue row sync" is plausibly the table's BUSINESS
-- FACT rather than provenance noise. Verified on prod: that table carries NO tg_audit_row trigger, so it
-- cannot reach this predicate today either way. The pattern keeps it excluded on purpose, so if the queue
-- is ever audited the decision does not silently default to "suppress".
--
-- INVENTORY AT THE TIME OF WRITING (pg_class/pg_attribute, audited tables only, prod br-fancy-credit-akjnd07a):
--   updated_at          40 audited tables
--   last_qbo_synced_at   7 audited tables (accounting.bill_payments, bills, credit_memos, invoices,
--                          journal_entries, payments, vendor_credits)
--   qbo_synced_at        3 audited tables (banking.bank_transactions, mdata.customers, mdata.vendors)
--   last_synced_at       0 audited (4 unaudited tables carry it — covered by the pattern if that changes)
--   synced_at            0 audited (integrations.qbo_sync_queue only — deliberately NOT matched)
--
-- EVERYTHING ELSE ABOUT THE GUARD IS UNCHANGED and still deliberate: the comparison is the WHOLE
-- remaining document, so one cent, one status, one FK or a column added tomorrow means the documents
-- differ and the row is written exactly as before. It is not a list of fields we ignore; it is "nothing
-- else moved". INSERT and DELETE are untouched — neither is ever a no-op, and under void-not-delete a
-- DELETE is itself the event worth keeping.
--
-- NOT RETROACTIVE: no existing audit row is deleted or altered. audit.row_changes is append-only and
-- ih35_app holds neither UPDATE nor DELETE on it.
--
-- Idempotent: CREATE OR REPLACE FUNCTION; every existing tg_audit_row trigger picks up the new body.

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
  v_noise_keys text[];
BEGIN
  -- ACCT-F259 — derive the noise keys from THIS row's own document instead of a hard-coded list, so a
  -- new sync-stamp spelling is covered the day it appears rather than silently re-opening the gap.
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(key), ARRAY[]::text[])
      INTO v_noise_keys
      FROM jsonb_each(to_jsonb(NEW))
     WHERE key = 'updated_at'
        OR key LIKE '%\_synced\_at';

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

  -- ACCT-F177 / FAIL-AUDIT-ACTOR — app.current_user_id is set by withCurrentUser and (since #4969) by
  -- withLuciaBypass when the caller supplies an actor; app.user_id is kept as a legacy fallback.
  v_user_text := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    NULLIF(current_setting('app.user_id', true), '')
  );
  IF v_user_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_changed_by_user := v_user_text::uuid;
  END IF;

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
