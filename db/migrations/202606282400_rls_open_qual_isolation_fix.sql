-- ============================================================================
-- RLS open-qual isolation fix (RLS Block A — tenant-isolation security)
-- Tier-1 security migration. BUILD + branch-test; GUARD independently verifies isolation on a
-- Neon branch + applies JORGE-APPROVED + merges. Do NOT self-merge — the real proof (tenant-A-vs-B
-- with live sessions + that forgot-password still works) is GUARD's Neon step.
-- ----------------------------------------------------------------------------
-- GUARD live-verified on prod 2026-06-29: four RLS policies have using_qual = `true` — RLS is
-- enabled but the policy grants every row to any session (zero isolation; FORCE would not fix a
-- `true` policy). Plus mdata.load_stops INSERT/UPDATE are role-gated but not tenant-gated. This
-- migration scopes them. Idempotent (DROP POLICY IF EXISTS + CREATE). Additive — no table/data changes.
-- ============================================================================

-- TARGET 1 — identity.password_reset_tokens (was: FOR ALL TO PUBLIC USING true / WITH CHECK true).
-- All legitimate access runs under withLuciaBypass (forgot-password REQUEST + CONFIRM read/update),
-- EXCEPT the admin "create user + send setup invite" INSERT, which runs as the authenticated
-- Owner/Administrator (withCurrentUser, non-bypass). So: reads/updates require bypass; INSERT also
-- permitted for Owner/Administrator. The random-uuid token + expiry + single-use (used_at) remain
-- the credential — this only stops blanket non-bypass reads of the token table. (No SECURITY DEFINER
-- lookup fn needed: the confirm read already runs under bypass.)
DROP POLICY IF EXISTS password_reset_tokens_open ON identity.password_reset_tokens;
CREATE POLICY password_reset_tokens_open ON identity.password_reset_tokens
  FOR ALL TO PUBLIC
  USING ( identity.is_lucia_bypass() )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])
  );

-- TARGET 2 — usmca_ops.activation_state + activation_audit (were: USING true / WITH CHECK true).
-- These have NO operating_company_id (single USMCA activation state machine) — do NOT opco-scope.
-- Activation controls are owner/admin-only; USMCA is pre-launch (hidden until July 2026), so this is
-- pre-launch hardening but it must not ship open.
DROP POLICY IF EXISTS usmca_activation_state_open ON usmca_ops.activation_state;
CREATE POLICY usmca_activation_state_open ON usmca_ops.activation_state
  FOR ALL TO PUBLIC
  USING ( identity.is_lucia_bypass() OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]) )
  WITH CHECK ( identity.is_lucia_bypass() OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]) );

DROP POLICY IF EXISTS usmca_activation_audit_open ON usmca_ops.activation_audit;
CREATE POLICY usmca_activation_audit_open ON usmca_ops.activation_audit
  FOR ALL TO PUBLIC
  USING ( identity.is_lucia_bypass() OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]) )
  WITH CHECK ( identity.is_lucia_bypass() OR identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]) );

-- TARGET 3 — identity.user_notification_preferences. A properly-scoped policy already exists
-- (user_notification_preferences_scope: user_uuid = current_setting('app.user_id') OR bypass). The
-- redundant permissive `_open` policy (USING true) OR-overrides it (permissive policies are OR'd), so
-- it nullifies the scope. The correct fix is to DROP the open policy — the scope policy then isolates.
-- Additive-safe: removes an over-permissive grant; the existing scoped policy is untouched.
DROP POLICY IF EXISTS user_notification_preferences_open ON identity.user_notification_preferences;

-- TARGET 4 — mdata.load_stops INSERT + UPDATE: role-gated but not tenant-gated. The SELECT policy
-- already scopes via EXISTS(mdata.loads). Bring INSERT/UPDATE to parity by ALSO requiring the parent
-- load be tenant-visible. The EXISTS runs under the caller's RLS on mdata.loads, so it means
-- "a load THIS tenant can see" (mdata.loads RLS is active for ih35_app).
DROP POLICY IF EXISTS load_stops_insert ON mdata.load_stops;
CREATE POLICY load_stops_insert ON mdata.load_stops
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum, 'Dispatcher'::identity.role_enum])
      AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = load_stops.load_id)
    )
  );

DROP POLICY IF EXISTS load_stops_update ON mdata.load_stops;
CREATE POLICY load_stops_update ON mdata.load_stops
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum, 'Dispatcher'::identity.role_enum])
      AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = load_stops.load_id)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum, 'Dispatcher'::identity.role_enum])
      AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = load_stops.load_id)
    )
  );
