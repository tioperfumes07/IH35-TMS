-- [HOLD-FOR-JORGE — B3-DISBURSE] Gate the cash-advance disburse GL post behind a per-entity kill-switch.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit approval. Default OFF; overrides below turn it ON
-- for all three entities so current behavior is preserved while making it individually controllable. ***
--
-- WHY: apps/backend/src/cash-advances/cash-advance-disburse.ts called postSourceTransaction('driver_advance')
-- with NO per-entity flag, while every other money poster already has a *_GL_POSTING_ENABLED kill-switch.
-- This migration seeds the flag and enables it for all operating companies so disburse+post continues
-- exactly as today; individual entities can then be turned OFF via the admin UI without code change.
--
-- SCOPE: lib.feature_flags seed + lib.feature_flag_overrides per entity.
-- Idempotent (ON CONFLICT DO NOTHING / DO UPDATE). No schema/table change.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'DRIVER_ADVANCE_GL_POSTING_ENABLED',
  'B3-DISBURSE: gates the balanced JE posted by cash-advances/cash-advance-disburse.ts when a driver advance/employee loan is disbursed. Per-entity override only; default OFF.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- Enable the flag for every known operating company so the existing disburse+post behavior is preserved.
-- This makes the kill-switch individually controllable per entity going forward.
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  INSERT INTO lib.feature_flag_overrides
    (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
  SELECT 'DRIVER_ADVANCE_GL_POSTING_ENABLED', c.id, NULL::uuid, true, owner_user.id
  FROM org.companies c
  JOIN lib.feature_flags ff ON ff.flag_key = 'DRIVER_ADVANCE_GL_POSTING_ENABLED'
  CROSS JOIN LATERAL (
    SELECT u.id
    FROM identity.users u
    WHERE u.role = 'Owner'
      AND u.deactivated_at IS NULL
      AND u.archived_at IS NULL
    ORDER BY u.created_at
    LIMIT 1
  ) AS owner_user
  WHERE c.code IN ('TRANSP', 'USMCA', 'TRK')
  ON CONFLICT (flag_key, operating_company_id)
    WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
  DO UPDATE SET
    enabled          = true,
    set_by_user_uuid = EXCLUDED.set_by_user_uuid,
    set_at           = now();
END
$seed$;

COMMIT;

-- ROLLBACK (owner-run only):
-- DELETE FROM lib.feature_flag_overrides
-- WHERE flag_key = 'DRIVER_ADVANCE_GL_POSTING_ENABLED';
