-- 202613312000_permission_model.sql
-- Permission model: three tables + is_primary_owner + role escalation guard + has_permission function.
--
-- Design:
--   - identity.permissions: catalog of actions (resource-level + field-level via nullable field_name)
--   - identity.role_permissions: role→permission grants (void-not-delete, entity-scoped via nullable operating_company_id)
--   - identity.user_permissions: per-user overrides (allow/deny, deny-wins, expires_at, entity-scoped)
--   - is_primary_owner on identity.users: hard floor keyed to person, not role.
--     Seeded for BOTH owner accounts (removes single-point-of-failure):
--       tioperfumes07@gmail.com · jpm@ih35trucking.net
--   - Role escalation guard (choice b): setting role='Owner' requires actor to be is_primary_owner (trigger).
--   - has_permission(): deny-wins, field-deny-beats-resource-allow, entity-scope fail-closed, expires_at enforced.
--   - PERMISSION_MODEL_ENFORCED flag default OFF — schema live, not enforced until wiring PR.
--
-- Entity-scope predicate (fail-closed): (operating_company_id IS NULL OR operating_company_id::text = v_opco)
--   NULL grant = all companies. Scoped grant with v_opco NULL → evaluates to NULL, not true → denied.
--
-- KNOWN LIMIT: role_permissions has no deny, so a role cannot be granted a resource while being denied
-- one of its fields. Per-user deny is the only route today. Recorded, not fixed.
--
-- TRUST BOUNDARY (owner 2026-08-31):
--   app.bypass_rls='lucia' is an everyday application setting (38+ backend call sites). It is NOT a
--   trust boundary for is_primary_owner / role='Owner' escalation. Both escalation triggers MUST NOT
--   call identity.is_lucia_bypass().
--
-- RECOVERY (lost primary-owner account):
--   SET LOCAL app.allow_owner_bootstrap = '1';  -- dedicated GUC; NO application code sets this
--   then UPDATE identity.users …  (Neon console / DBA only).
--   Grep-proven unused in apps/ at authoring time (rg allow_owner_bootstrap → 0 hits outside this file).
--
-- ORDERING: seed is_primary_owner BEFORE creating either trigger so migration-time UPDATE needs no escape.

-- ── Add is_primary_owner to identity.users ────────────────────────────────────────────────────────
ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS is_primary_owner boolean NOT NULL DEFAULT false;

-- ── Seed FIRST (triggers do not exist yet — no escalation-trigger bypass needed) ─────────────────
-- Owner 2026-08-31: BOTH accounts are the owner's own — second primary removes SPOF / Neon-only recovery.
-- RLS on identity.users may still require lucia for db-migrate session context; that is ONLY for this
-- pre-trigger seed UPDATE, never for the escalation triggers themselves.
DO $seed_primary$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  UPDATE identity.users
     SET is_primary_owner = true
   WHERE email IN (
           'tioperfumes07@gmail.com',
           'jpm@ih35trucking.net'
         )
     AND deactivated_at IS NULL;
END $seed_primary$;

-- ── Helper: identity.current_user_is_primary_owner() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION identity.current_user_is_primary_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'identity', 'public' AS $$
DECLARE
  v_result boolean;
BEGIN
  SELECT u.is_primary_owner INTO v_result
    FROM identity.users u
   WHERE u.id = identity.current_user_id()
     AND u.deactivated_at IS NULL
   LIMIT 1;
  RETURN COALESCE(v_result, false);
END;
$$;

-- ── Helper: dedicated bootstrap GUC (NOT lucia) ──────────────────────────────────────────────────
-- Returns true only when app.allow_owner_bootstrap = '1'. Application code must never set this.
CREATE OR REPLACE FUNCTION identity.allow_owner_bootstrap()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.allow_owner_bootstrap', true), ''), '') = '1';
$$;

-- ── Trigger: only a current primary owner can change is_primary_owner ────────────────────────────
-- Blocks self-elevation, elevation of others, and demotion by non-primary owners.
-- NO lucia escape. Bootstrap GUC only for Neon/DBA recovery.
CREATE OR REPLACE FUNCTION identity.guard_is_primary_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'identity', 'public' AS $$
DECLARE
  v_actor_is_primary boolean;
  v_new_primary boolean;
  v_old_primary boolean;
BEGIN
  v_new_primary := COALESCE(NEW.is_primary_owner, false);
  IF TG_OP = 'INSERT' THEN
    IF v_new_primary = false THEN
      RETURN NEW;
    END IF;
  ELSE
    v_old_primary := COALESCE(OLD.is_primary_owner, false);
    IF v_new_primary IS NOT DISTINCT FROM v_old_primary THEN
      RETURN NEW;
    END IF;
  END IF;

  IF identity.allow_owner_bootstrap() THEN
    RETURN NEW;
  END IF;

  SELECT u.is_primary_owner INTO v_actor_is_primary
    FROM identity.users u
   WHERE u.id = identity.current_user_id()
     AND u.deactivated_at IS NULL
   LIMIT 1;

  IF COALESCE(v_actor_is_primary, false) = false THEN
    RAISE EXCEPTION 'is_primary_owner can only be changed by an existing primary owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_is_primary_owner ON identity.users;
CREATE TRIGGER trg_guard_is_primary_owner
  BEFORE INSERT OR UPDATE OF is_primary_owner ON identity.users
  FOR EACH ROW
  EXECUTE FUNCTION identity.guard_is_primary_owner();

-- ── Trigger: setting role='Owner' requires actor to be is_primary_owner (choice b) ───────────────
-- Blocks Administrator (who holds user.role.change) from escalating any user to Owner.
-- Same shape as is_primary_owner guard. NO lucia escape. Covers INSERT and UPDATE.
CREATE OR REPLACE FUNCTION identity.guard_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'identity', 'public' AS $$
DECLARE
  v_actor_is_primary boolean;
  v_assigning_owner boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_assigning_owner := (NEW.role = 'Owner'::identity.role_enum);
  ELSE
    v_assigning_owner := (
      NEW.role = 'Owner'::identity.role_enum
      AND OLD.role IS DISTINCT FROM 'Owner'::identity.role_enum
    );
  END IF;

  IF NOT v_assigning_owner THEN
    RETURN NEW;
  END IF;

  IF identity.allow_owner_bootstrap() THEN
    RETURN NEW;
  END IF;

  SELECT u.is_primary_owner INTO v_actor_is_primary
    FROM identity.users u
   WHERE u.id = identity.current_user_id()
     AND u.deactivated_at IS NULL
   LIMIT 1;

  IF COALESCE(v_actor_is_primary, false) = false THEN
    RAISE EXCEPTION 'role_escalation_blocked: only a primary owner can assign the Owner role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_role_escalation ON identity.users;
CREATE TRIGGER trg_guard_role_escalation
  BEFORE INSERT OR UPDATE OF role ON identity.users
  FOR EACH ROW
  EXECUTE FUNCTION identity.guard_role_escalation();

-- ── Table 1: identity.permissions — the catalog of what actions exist ─────────────────────────────
CREATE TABLE IF NOT EXISTS identity.permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key  text NOT NULL,
  description     text NOT NULL,
  module          text NOT NULL,
  resource_type   text NOT NULL,
  action          text NOT NULL,
  field_name      text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS permissions_key_field_uniq
  ON identity.permissions (permission_key, COALESCE(field_name, ''))
  WHERE is_active = true;

-- ── Table 2: identity.role_permissions — which roles have which permissions (void-not-delete) ──────
CREATE TABLE IF NOT EXISTS identity.role_permissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                  identity.role_enum NOT NULL,
  permission_id         uuid NOT NULL REFERENCES identity.permissions(id),
  operating_company_id  uuid,
  granted_by_user_id    uuid REFERENCES identity.users(id),
  granted_at            timestamptz NOT NULL DEFAULT now(),
  deactivated_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_active_uniq
  ON identity.role_permissions (role, permission_id, COALESCE(operating_company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deactivated_at IS NULL;

-- ── Table 3: identity.user_permissions — per-user overrides (grant or deny, deny wins) ───────────
CREATE TABLE IF NOT EXISTS identity.user_permissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES identity.users(id),
  permission_id         uuid NOT NULL REFERENCES identity.permissions(id),
  grant_type            text NOT NULL CHECK (grant_type IN ('allow', 'deny')),
  operating_company_id  uuid,
  reason                text,
  expires_at            timestamptz,
  granted_by_user_id    uuid REFERENCES identity.users(id),
  granted_at            timestamptz NOT NULL DEFAULT now(),
  deactivated_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_active_uniq
  ON identity.user_permissions (user_id, permission_id, grant_type, COALESCE(operating_company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deactivated_at IS NULL;

-- ── Indexes for lookup performance ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS role_permissions_role_idx
  ON identity.role_permissions (role) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS role_permissions_perm_idx
  ON identity.role_permissions (permission_id) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS user_permissions_user_idx
  ON identity.user_permissions (user_id) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS user_permissions_perm_idx
  ON identity.user_permissions (permission_id) WHERE deactivated_at IS NULL;

-- ── RLS: identity.permissions — catalog visible to all authenticated; write Owner-only ───────────
ALTER TABLE identity.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_select ON identity.permissions;
DROP POLICY IF EXISTS permissions_write  ON identity.permissions;
CREATE POLICY permissions_select ON identity.permissions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR identity.current_user_id() IS NOT NULL);
CREATE POLICY permissions_write ON identity.permissions FOR ALL
  USING (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum)
  WITH CHECK (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum);

-- ── RLS: identity.role_permissions — visible to authenticated users; write Owner-only ────────────
ALTER TABLE identity.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_select ON identity.role_permissions;
DROP POLICY IF EXISTS role_permissions_write  ON identity.role_permissions;
CREATE POLICY role_permissions_select ON identity.role_permissions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum
         OR identity.current_user_id() IS NOT NULL);
CREATE POLICY role_permissions_write ON identity.role_permissions FOR ALL
  USING (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum)
  WITH CHECK (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum);

-- ── RLS: identity.user_permissions — visible to self + Owner; write Owner-only ───────────────────
ALTER TABLE identity.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permissions_select ON identity.user_permissions;
DROP POLICY IF EXISTS user_permissions_write  ON identity.user_permissions;
CREATE POLICY user_permissions_select ON identity.user_permissions FOR SELECT
  USING (identity.is_lucia_bypass()
         OR user_id = identity.current_user_id()
         OR identity.current_user_role() = 'Owner'::identity.role_enum);
CREATE POLICY user_permissions_write ON identity.user_permissions FOR ALL
  USING (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum)
  WITH CHECK (identity.is_lucia_bypass()
         OR identity.current_user_role() = 'Owner'::identity.role_enum);

-- ── Grants to ih35_app (runtime role) ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON identity.permissions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON identity.role_permissions TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON identity.user_permissions TO ih35_app;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- has_permission — actual function body
--
-- Evaluation order (deny-wins, field-deny beats resource-allow):
--   1. No user → false
--   2. is_primary_owner → true (hard floor — keyed to person not role)
--   3. Resolve permission row(s): resource-level (field_name IS NULL) + field-level (field_name = p_field)
--   4. FIELD-LEVEL DENY → false (beats resource-level allow)
--   5. RESOURCE-LEVEL DENY → false
--   6. FIELD-LEVEL ALLOW → true
--   7. RESOURCE-LEVEL ALLOW → true
--   8. ROLE GRANT (field then resource) → true
--   9. Otherwise → false
--
-- Entity-scope predicate (fail-closed, 6 occurrences):
--   (operating_company_id IS NULL OR operating_company_id::text = v_opco)
--   NULL grant = all companies. v_opco NULL → scoped grant evaluates to NULL → denied.
--
-- expires_at predicate (every user_permissions check):
--   (expires_at IS NULL OR expires_at > now())
-- ════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION identity.has_permission(p_key text, p_field text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'identity', 'public' AS $$
DECLARE
  v_role        identity.role_enum;
  v_uid         uuid;
  v_opco        text;
  v_perm_res_id uuid;
  v_perm_fld_id uuid;
  v_user_deny   boolean;
  v_user_allow  boolean;
  v_role_grant  boolean;
BEGIN
  v_uid := identity.current_user_id();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF identity.current_user_is_primary_owner() THEN
    RETURN true;
  END IF;

  v_role := identity.current_user_role();
  v_opco := NULLIF(current_setting('app.operating_company_id', true), '');

  -- Resolve permission row(s)
  SELECT id INTO v_perm_res_id
    FROM identity.permissions
   WHERE permission_key = p_key
     AND is_active = true
     AND field_name IS NULL
   LIMIT 1;

  IF p_field IS NOT NULL THEN
    SELECT id INTO v_perm_fld_id
      FROM identity.permissions
     WHERE permission_key = p_key
       AND is_active = true
       AND field_name = p_field
     LIMIT 1;
  END IF;

  IF v_perm_res_id IS NULL AND v_perm_fld_id IS NULL THEN
    RETURN false;
  END IF;

  -- Step 4: FIELD-LEVEL DENY beats everything
  IF v_perm_fld_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.user_permissions up
       WHERE up.user_id = v_uid
         AND up.permission_id = v_perm_fld_id
         AND up.grant_type = 'deny'
         AND up.deactivated_at IS NULL
         AND (up.expires_at IS NULL OR up.expires_at > now())
         AND (up.operating_company_id IS NULL OR up.operating_company_id::text = v_opco)
    ) INTO v_user_deny;
    IF v_user_deny THEN
      RETURN false;
    END IF;
  END IF;

  -- Step 5: RESOURCE-LEVEL DENY
  IF v_perm_res_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.user_permissions up
       WHERE up.user_id = v_uid
         AND up.permission_id = v_perm_res_id
         AND up.grant_type = 'deny'
         AND up.deactivated_at IS NULL
         AND (up.expires_at IS NULL OR up.expires_at > now())
         AND (up.operating_company_id IS NULL OR up.operating_company_id::text = v_opco)
    ) INTO v_user_deny;
    IF v_user_deny THEN
      RETURN false;
    END IF;
  END IF;

  -- Step 6: FIELD-LEVEL ALLOW
  IF v_perm_fld_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.user_permissions up
       WHERE up.user_id = v_uid
         AND up.permission_id = v_perm_fld_id
         AND up.grant_type = 'allow'
         AND up.deactivated_at IS NULL
         AND (up.expires_at IS NULL OR up.expires_at > now())
         AND (up.operating_company_id IS NULL OR up.operating_company_id::text = v_opco)
    ) INTO v_user_allow;
    IF v_user_allow THEN
      RETURN true;
    END IF;
  END IF;

  -- Step 7: RESOURCE-LEVEL ALLOW
  IF v_perm_res_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.user_permissions up
       WHERE up.user_id = v_uid
         AND up.permission_id = v_perm_res_id
         AND up.grant_type = 'allow'
         AND up.deactivated_at IS NULL
         AND (up.expires_at IS NULL OR up.expires_at > now())
         AND (up.operating_company_id IS NULL OR up.operating_company_id::text = v_opco)
    ) INTO v_user_allow;
    IF v_user_allow THEN
      RETURN true;
    END IF;
  END IF;

  -- Step 8: ROLE GRANT (field then resource)
  IF v_perm_fld_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.role_permissions rp
       WHERE rp.role = v_role
         AND rp.permission_id = v_perm_fld_id
         AND rp.deactivated_at IS NULL
         AND (rp.operating_company_id IS NULL OR rp.operating_company_id::text = v_opco)
    ) INTO v_role_grant;
    IF v_role_grant THEN
      RETURN true;
    END IF;
  END IF;

  IF v_perm_res_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM identity.role_permissions rp
       WHERE rp.role = v_role
         AND rp.permission_id = v_perm_res_id
         AND rp.deactivated_at IS NULL
         AND (rp.operating_company_id IS NULL OR rp.operating_company_id::text = v_opco)
    ) INTO v_role_grant;
    IF v_role_grant THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ── Function: identity.require_permission — raises exception if not authorized ───────────────────
CREATE OR REPLACE FUNCTION identity.require_permission(p_key text, p_field text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'identity', 'public' AS $$
BEGIN
  IF NOT identity.has_permission(p_key, p_field) THEN
    RAISE EXCEPTION 'permission_denied: % (field: %)', p_key, COALESCE(p_field, '<resource>');
  END IF;
END;
$$;

-- ── Audit triggers — permission changes are themselves attributed and traceable ──────────────────
SELECT audit.ensure_row_trigger('identity', 'permissions');
SELECT audit.ensure_row_trigger('identity', 'role_permissions');
SELECT audit.ensure_row_trigger('identity', 'user_permissions');

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- SEED LIST — 14 permissions, role grants matching today's behavior + owner-specified tonight
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  -- ── Permissions catalog (14 rows) ────────────────────────────────────────────────────────────

  -- Owner-specified tonight (7) — seeded to Owner + Accountant ONLY
  INSERT INTO identity.permissions (permission_key, description, module, resource_type, action) VALUES
    ('invoice.void',        'Void an invoice',                    'accounting',     'invoice',       'void'),
    ('bill.void',           'Void a bill',                        'accounting',     'bill',          'void'),
    ('bill_payment.void',   'Void a bill payment',                'accounting',     'bill_payment',  'void'),
    ('payment.void',        'Void a payment',                     'accounting',     'payment',       'void'),
    ('settlement.void',     'Void a driver settlement',           'driver_finance', 'settlement',    'void'),
    ('load.cancel',         'Cancel a load',                      'dispatch',       'load',          'cancel'),
    ('settlement.unlock',   'Unlock a locked settlement',         'driver_finance', 'settlement',    'unlock')
  ON CONFLICT DO NOTHING;

  -- Remaining permissions (7) — seeded per current behavior
  INSERT INTO identity.permissions (permission_key, description, module, resource_type, action) VALUES
    ('settlement.approve',  'Approve a driver settlement',        'driver_finance', 'settlement',    'approve'),
    ('settlement.pay',      'Pay a driver settlement',            'driver_finance', 'settlement',    'pay'),
    ('expense.void',        'Void an expense',                    'accounting',     'expense',       'void'),
    ('work_order.void',     'Void a work order',                  'work_orders',    'work_order',    'void'),
    ('user.create',         'Create a new user',                  'identity',       'user',          'create'),
    ('user.deactivate',     'Deactivate a user',                  'identity',       'user',          'deactivate'),
    ('user.role.change',    'Change a user role',                 'identity',       'user',          'edit')
  ON CONFLICT DO NOTHING;

  -- ── Role grants ──────────────────────────────────────────────────────────────────────────────

  -- Owner-specified 7: Owner + Accountant ONLY (not Administrator)
  INSERT INTO identity.role_permissions (role, permission_id)
    SELECT r.role, p.id
      FROM identity.permissions p
      CROSS JOIN (VALUES
        ('Owner'::identity.role_enum),
        ('Accountant'::identity.role_enum)
      ) AS r(role)
     WHERE p.permission_key IN (
       'invoice.void',
       'bill.void',
       'bill_payment.void',
       'payment.void',
       'settlement.void',
       'load.cancel',
       'settlement.unlock'
     )
  ON CONFLICT DO NOTHING;

  -- void/cancel executors (remaining): Owner + Administrator + Accountant
  INSERT INTO identity.role_permissions (role, permission_id)
    SELECT r.role, p.id
      FROM identity.permissions p
      CROSS JOIN (VALUES
        ('Owner'::identity.role_enum),
        ('Administrator'::identity.role_enum),
        ('Accountant'::identity.role_enum)
      ) AS r(role)
     WHERE p.permission_key IN (
       'expense.void', 'work_order.void'
     )
  ON CONFLICT DO NOTHING;

  -- settlement.approve: Owner + Administrator
  INSERT INTO identity.role_permissions (role, permission_id)
    SELECT r.role, p.id
      FROM identity.permissions p
      CROSS JOIN (VALUES
        ('Owner'::identity.role_enum),
        ('Administrator'::identity.role_enum)
      ) AS r(role)
     WHERE p.permission_key = 'settlement.approve'
  ON CONFLICT DO NOTHING;

  -- settlement.pay: Owner + Administrator
  INSERT INTO identity.role_permissions (role, permission_id)
    SELECT r.role, p.id
      FROM identity.permissions p
      CROSS JOIN (VALUES
        ('Owner'::identity.role_enum),
        ('Administrator'::identity.role_enum)
      ) AS r(role)
     WHERE p.permission_key = 'settlement.pay'
  ON CONFLICT DO NOTHING;

  -- user management: Owner + Administrator
  INSERT INTO identity.role_permissions (role, permission_id)
    SELECT r.role, p.id
      FROM identity.permissions p
      CROSS JOIN (VALUES
        ('Owner'::identity.role_enum),
        ('Administrator'::identity.role_enum)
      ) AS r(role)
     WHERE p.permission_key IN ('user.create', 'user.deactivate', 'user.role.change')
  ON CONFLICT DO NOTHING;

END $seed$;

-- ── Feature flag: default OFF — wiring (TypeScript calling has_permission) is a separate PR ───────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'PERMISSION_MODEL_ENFORCED',
  'When ON, backend routes call identity.has_permission() instead of hardcoded role checks. DEFAULT OFF — owner-gated. Schema is live but not enforced until this flag is flipped.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;
