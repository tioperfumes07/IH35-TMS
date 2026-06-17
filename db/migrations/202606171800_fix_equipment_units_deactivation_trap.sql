-- TIER-1 RLS fix: the equipment/units SOFT-DELETE deactivation trap.
--
-- ROOT CAUSE (proven live via #1135 diagnostic on a1ac5f9/961a349, probes as ih35_app with
-- is_lucia_bypass()=FALSE — i.e. #1138 working, no superuser mask):
--   current_user_role='Owner', is_lucia_bypass=FALSE, db_session_user=ih35_app, owner_in_accessible=true,
--   updateError=42501 ExecWithCheckOptions, auditError=null.
--   POST /mdata/equipment/:id/deactivate runs `UPDATE mdata.equipment SET deactivated_at = now() ...`
--   (no RETURNING). The post-update row (deactivated_at NOT NULL) is enforced against the SELECT-visibility
--   predicate; equipment_select USING gates `deactivated_at IS NULL`, so the soft-deleted row fails it →
--   42501. equipment_update's own WITH CHECK is role-only and PASSES for an Owner, so the trap is in the
--   SELECT policy, not the UPDATE policy — no UPDATE-policy change can bypass the SELECT-visibility check.
--
-- FIX (per-entity, role-scoped — NOT opened to all): let Owner/Administrator/Manager SEE soft-deleted rows
-- WITHIN their accessible companies. Non-managers still see only active rows; cross-entity rows stay
-- hidden. This (a) lets the soft-delete UPDATE's post-update row pass select-visibility (fixes the 42501),
-- and (b) enables the intended view/reactivate-inactive UX. App-layer list queries keep their own
-- `deactivated_at IS NULL` WHERE filter, so default lists are unchanged; only include-inactive paths surface
-- the soft-deleted rows. Idempotent (DROP + CREATE). is_lucia_bypass() now returns strict false (#1138).

BEGIN;

DROP POLICY IF EXISTS equipment_select ON mdata.equipment;
CREATE POLICY equipment_select ON mdata.equipment
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    (
      owner_company_id IN (SELECT org.user_accessible_company_ids())
      OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids())
    )
    AND (
      deactivated_at IS NULL
      OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
    )
  )
);

DROP POLICY IF EXISTS units_select ON mdata.units;
CREATE POLICY units_select ON mdata.units
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    (
      owner_company_id IN (SELECT org.user_accessible_company_ids())
      OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids())
    )
    AND (
      deactivated_at IS NULL
      OR identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
    )
  )
);

COMMIT;
