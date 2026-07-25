-- [HOLD-FOR-JORGE] LST-RLS-01 — WRITE-AUTHZ + FORCE RLS on the two global catalogs that carry none:
--   catalogs.account_types            (migration 202606080010)
--   catalogs.wo_cancellation_reasons  (migration 202606221200)
--
-- *** DO NOT RUN ON PROD. *** Registered in db/migrations/.held-migrations.json. The owner applies this on
-- the Neon prod branch by hand and ledger-backfills it so preDeploy `db:migrate` skips it. CI builds it
-- fresh from 0001. POSTS NOTHING — no GL, no money, no data rows created or removed.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- ROOT CAUSE (established from db/migrations only — this author has NO database access)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- catalogs.account_types
--   • created 202606080010_account_type_detail_type_catalog.sql:16-27 — columns id/code/name/group_label/
--     statement/normal_balance/default_action/sort_order/is_active/created_at. There is NO
--     operating_company_id column, in that migration or any later one.
--   • :54  GRANT SELECT, INSERT, UPDATE ON catalogs.account_types TO ih35_app;
--   • No `ENABLE ROW LEVEL SECURITY`, no `FORCE ROW LEVEL SECURITY`, no CREATE POLICY anywhere in
--     db/migrations for this table (grep over db/migrations/*.sql returns zero hits).
--   ⇒ RLS is OFF and every INSERT/UPDATE is authorised by the GRANT alone: ANY authenticated role —
--     Dispatcher, Safety, a driver-linked user — can rewrite the canonical 15-type QBO taxonomy that the
--     entire chart of accounts is keyed to. No role check exists at the database layer.
--
-- catalogs.wo_cancellation_reasons
--   • created 202606221200_wo_enhancements_cancel.sql:31-37 — reason_code (PK) / reason_label /
--     requires_owner_approval / sort_order / is_active. No operating_company_id.
--   • :46  GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.wo_cancellation_reasons TO ih35_app;
--   • :5 and :9-10 record the original decision in the migration's own header: "a global enum-label
--     catalog with NO audit trigger and NO RLS" / "no operating_company_id … shared UI reason labels,
--     NOT entity-scoped financial data. Acceptable (GUARD-confirmed)."
--   ⇒ RLS is OFF and DELETE is EXPLICITLY GRANTED — a hard violation of the void-not-delete invariant.
--     maintenance.work_orders.cancel_reason_code validates against this catalog, so deleting a reason row
--     silently strips the label off historical cancelled work orders (legal-evidence data).
--
-- The catalogs schema additionally carries `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE, DELETE
-- ON TABLES TO ih35_app` (0065_p3_cleanup_3_permanent_grants.sql:48 and
-- 0116_p6_privilege_reconciliation.sql:45-46). Both tables were created AFTER those ran, so the effective
-- privilege set on catalogs.account_types includes DELETE even though its own GRANT names only SELECT/
-- INSERT/UPDATE. This is the documented "0065 landmine" — see 202607420000_vendor_types_catalog.sql:80-82,
-- which states it and REVOKEs DELETE explicitly for exactly this reason. A narrow GRANT is not enough.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- CLASS VERDICT — both tables are SHARED-CANONICAL (GLOBAL). They are NOT company-scoped, and this
-- migration deliberately does NOT add operating_company_id.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- catalogs.account_types is the fixed QBO system taxonomy. 202607011700_detail_types_per_entity_custom.sql
--   :5-13 states the model explicitly: "Account Type stays the fixed GLOBAL system taxonomy
--   (catalogs.account_types, read-only) … account_types is a GLOBAL reference (no operating_company_id),
--   so detail_types.account_type_id is a same-catalog FK to that shared taxonomy (no entity commingling:
--   the ENTITY boundary is on detail_types.operating_company_id, not on the shared type)." The entity
--   boundary is one level DOWN, on catalogs.detail_types. Adding operating_company_id here (necessarily
--   all-NULL on the 15 existing seed rows) and writing an `= current_setting('app.operating_company_id')`
--   policy under FORCE RLS would return ZERO rows to every caller — it would blank the Account Type
--   dropdown on the CoA creator and break account-type-catalog.routes.ts:70-83, whose SELECT already
--   joins detail_types with `dt.operating_company_id IS NULL OR = $1` precisely because the parent type
--   is shared. That is the failure mode this block was warned about; it is avoided.
-- catalogs.wo_cancellation_reasons is 6 UI enum labels consumed read-only by
--   apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts:16-33 with no company predicate at all.
--   Its creating migration recorded the global decision as GUARD-confirmed (202606221200:9-10). Entity-
--   scoping it would empty the Cancel-WO reason dropdown for every entity.
-- ⇒ The correct deliverable for BOTH is WRITE-AUTHZ ONLY: reads stay open to every authenticated caller
--   (USING (true) — a strict no-op on today's read paths), writes narrow to Owner/Administrator, DELETE is
--   removed at both the grant layer and the policy layer.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- SCOPE (schema/authz only)
--   1. ENABLE + FORCE ROW LEVEL SECURITY on both tables.
--   2. SELECT policy USING (true)  — global catalog; zero read behaviour change.
--   3. INSERT and UPDATE policies restricted to Owner/Administrator, OR identity.is_lucia_bypass()
--      (the system/migration path — apps/backend/src/auth/db.ts:158-186 sets app.bypass_rls='lucia').
--   4. NO DELETE policy is created, and DELETE is REVOKEd from ih35_app on both tables. Under FORCE RLS a
--      command with no permissive policy is denied, so DELETE is blocked twice over: even if a future
--      ALTER DEFAULT PRIVILEGES sweep re-grants DELETE, RLS still refuses it.
--   5. Documenting COMMENTs recording the shared-canonical class + the write rule.
--
-- NEVER-DELETE: no DROP TABLE, no DELETE, no TRUNCATE, no column removal. Existing policy names are
-- DROP POLICY IF EXISTS'd only to make the CREATE POLICY re-runnable (the repo-wide idempotency idiom,
-- e.g. 202607420000_vendor_types_catalog.sql:69-71) — no policy authored elsewhere is dropped.
--
-- IDEMPOTENCY / FRESH-DB CI: every statement is guarded by IF EXISTS on the table (to_regclass) or is
-- itself idempotent (ENABLE/FORCE RLS, DROP POLICY IF EXISTS + CREATE POLICY, GRANT/REVOKE, COMMENT).
-- Nothing depends on runtime data, nothing RAISEs, and no org.companies row is required — a fresh DB
-- built from 0001 gets the same end state as prod. Re-running is a clean no-op.
--
-- ROLE SET: identity.role_enum is defined at 0004_identity_init.sql:11-18 (Owner, Administrator, Manager,
-- Accountant, Dispatcher, Safety, …). Owner/Administrator only — these are canonical system taxonomies,
-- not per-entity operating data; the narrower set matches 0017_equipment_types_catalog.sql:52-61
-- (equipment_types_insert_admin / equipment_types_update_admin), the closest existing global-catalog
-- precedent, rather than the wider Owner/Administrator/Manager/Accountant set used for the per-entity
-- financial catalogs.

BEGIN;

-- ── catalogs.account_types ────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('catalogs.account_types') IS NULL THEN
    RAISE NOTICE 'catalogs.account_types absent — skipping (nothing to secure)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE catalogs.account_types ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE catalogs.account_types FORCE ROW LEVEL SECURITY';

  -- Read: global catalog, every authenticated caller. account-type-catalog.routes.ts runs under
  -- withCurrentUser (auth/db.ts:211-242) as ih35_app WITHOUT the lucia bypass, so this policy is what
  -- keeps the Account Type dropdown populated. USING (true) => zero read behaviour change.
  EXECUTE 'DROP POLICY IF EXISTS account_types_read_all ON catalogs.account_types';
  EXECUTE $p$
    CREATE POLICY account_types_read_all ON catalogs.account_types
      FOR SELECT
      USING (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS account_types_insert_admin ON catalogs.account_types';
  EXECUTE $p$
    CREATE POLICY account_types_insert_admin ON catalogs.account_types
      FOR INSERT
      WITH CHECK (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS account_types_update_admin ON catalogs.account_types';
  EXECUTE $p$
    CREATE POLICY account_types_update_admin ON catalogs.account_types
      FOR UPDATE
      USING (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
      WITH CHECK (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
  $p$;
  -- Deliberately NO delete policy: under FORCE RLS, DELETE with no permissive policy is denied.

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON catalogs.account_types TO ih35_app';
    -- 0065/0116 ALTER DEFAULT PRIVILEGES granted DELETE on every catalogs table created afterwards; the
    -- narrow GRANT above does not take it away. Revoke it explicitly (void-not-delete).
    EXECUTE 'REVOKE DELETE ON catalogs.account_types FROM ih35_app';
  END IF;

  EXECUTE $c$
    COMMENT ON TABLE catalogs.account_types IS
      'SHARED-CANONICAL (global) QBO account-type taxonomy — 15 system types, NO operating_company_id by design (202607011700). The entity boundary lives on catalogs.detail_types.operating_company_id, never here. FORCE RLS: read open to every authenticated caller; INSERT/UPDATE Owner/Administrator only; DELETE revoked and unpolicied (void via is_active).'
  $c$;
END
$$;

-- ── catalogs.wo_cancellation_reasons ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('catalogs.wo_cancellation_reasons') IS NULL THEN
    RAISE NOTICE 'catalogs.wo_cancellation_reasons absent — skipping (nothing to secure)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE catalogs.wo_cancellation_reasons ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE catalogs.wo_cancellation_reasons FORCE ROW LEVEL SECURITY';

  -- Read: the Cancel-WO reason dropdown (wo-cancellation-reasons.routes.ts:16-33) and the WO cancel
  -- route's preValidation both read this under withCurrentUser. USING (true) keeps both working.
  EXECUTE 'DROP POLICY IF EXISTS wo_cancellation_reasons_read_all ON catalogs.wo_cancellation_reasons';
  EXECUTE $p$
    CREATE POLICY wo_cancellation_reasons_read_all ON catalogs.wo_cancellation_reasons
      FOR SELECT
      USING (true)
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS wo_cancellation_reasons_insert_admin ON catalogs.wo_cancellation_reasons';
  EXECUTE $p$
    CREATE POLICY wo_cancellation_reasons_insert_admin ON catalogs.wo_cancellation_reasons
      FOR INSERT
      WITH CHECK (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS wo_cancellation_reasons_update_admin ON catalogs.wo_cancellation_reasons';
  EXECUTE $p$
    CREATE POLICY wo_cancellation_reasons_update_admin ON catalogs.wo_cancellation_reasons
      FOR UPDATE
      USING (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
      WITH CHECK (
        identity.is_lucia_bypass()
        OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,
                                                     'Administrator'::identity.role_enum])
      )
  $p$;
  -- Deliberately NO delete policy.

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON catalogs.wo_cancellation_reasons TO ih35_app';
    -- 202606221200:46 granted DELETE outright. Revoke it: a cancelled work order's reason label is
    -- legal-evidence data and must be retired with is_active=false, never deleted.
    EXECUTE 'REVOKE DELETE ON catalogs.wo_cancellation_reasons FROM ih35_app';
  END IF;

  EXECUTE $c$
    COMMENT ON TABLE catalogs.wo_cancellation_reasons IS
      'SHARED-CANONICAL (global) work-order cancellation reason labels — NO operating_company_id by design (202606221200:9-10). FORCE RLS: read open to every authenticated caller; INSERT/UPDATE Owner/Administrator only; DELETE revoked and unpolicied — retire a reason with is_active=false (void-not-delete; maintenance.work_orders.cancel_reason_code points here).'
  $c$;
END
$$;

COMMIT;
