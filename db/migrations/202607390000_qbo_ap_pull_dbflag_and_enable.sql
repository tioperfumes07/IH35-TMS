-- 202607390000_qbo_ap_pull_dbflag_and_enable.sql
-- [HOLD-FOR-JORGE — TIER 1] QBO-AP-PULL-WIRE — register the inbound QBO A/P pull flags in
-- lib.feature_flags and turn them ON per-entity for TRANSP + TRK (the QBO-realm carriers), so the
-- daily QBO->TMS A/P clone finally runs. NEVER self-merge — financial governance + turns on a
-- financial write path (accounting.bills subledger, source_system='qbo'). No GL/journal is posted.
--
-- ROOT CAUSE (verified live 2026-07-13/14): the built puller apps/backend/src/qbo-sync/ap-bills-puller.ts
-- gated Stage 1/Stage 2 ONLY on a module-level process.env var (QBO_AP_MIRROR_PULL_ENABLED /
-- QBO_AP_BILLS_PROJECTION_ENABLED). The two flags were NEVER registered in lib.feature_flags, and no
-- Render env var was set, so the scheduler tick was a permanent no-op: accounting.bills = 0 rows while
-- QuickBooks carries ~$1.35M A/P across 151 vendors. The A/P / expenses screen therefore renders empty
-- ("no wiring"). The companion code change moves the gate to the DB feature flag (isEnabled(), resolved
-- PER-ENTITY via lib.feature_flag_overrides) so there is ONE visible switch and no hidden env dependency.
--
-- ARCHITECTURE: parallel double-books, reconcile-ONLY. This is a one-directional QBO -> TMS READ-IN.
-- The projection populates the A/P SUBLEDGER only (accounting.bills source_system='qbo'); GL stays
-- QuickBooks' job. No TMS -> QBO write is introduced. USMCA is intentionally NOT enabled (no QBO realm).
--
-- CI-SAFE / fresh-DB replay: the flag catalog rows have no FK dependency and always seed. The per-entity
-- ON overrides are data-driven (INSERT ... SELECT from org.companies + the owner user); on a fresh CI DB
-- from 0001 those rows do not exist, so ZERO override rows are inserted and the migration passes. On prod
-- the two carriers + owner resolve, so 4 override rows (2 flags x TRANSP/TRK) are written ON. Idempotent.

BEGIN;

-- 1) Register both flags in the catalog, DEFAULT OFF (isEnabled() returns false when a row/override is
--    absent, so this is SAFE-OFF; the per-entity overlay below is what actually enables them).
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_AP_MIRROR_PULL_ENABLED',
        'QBO-AP-PULL Stage 1: clone QuickBooks Bills into the read-only mirror mdata.qbo_ap_bills '
          || '(upsert by qbo_id). Inbound reconcile-only; no GL. Resolved per-entity via overrides. OFF by default.',
        false,
        0
      ),
      (
        'QBO_AP_BILLS_PROJECTION_ENABLED',
        'QBO-AP-PULL Stage 2: project the QBO A/P mirror into accounting.bills (source_system=''qbo'') so '
          || 'the A/P aging / expenses screen reflects QuickBooks'' real A/P. Subledger only, NO GL posting. '
          || 'Resolved per-entity via overrides. OFF by default.',
        false,
        0
      )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

-- 2) Turn both flags ON per-entity for TRANSP + TRK (the entities with a QBO realm). Data-driven so a
--    fresh CI DB (no companies / no owner user) inserts nothing. set_by_user_uuid = the owner (required
--    NOT NULL; this IS the owner's approval, recorded on merge). user_uuid IS NULL => entity-scoped row
--    matching the partial unique index idx_ff_override_oci (flag_key, operating_company_id).
DO $$
DECLARE
  v_owner uuid;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL
     OR to_regclass('org.companies') IS NULL
     OR to_regclass('identity.users') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_owner
  FROM identity.users
  WHERE lower(email) = 'tioperfumes07@gmail.com'
    AND deactivated_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner IS NULL THEN
    -- No owner user resolvable (e.g. fresh CI DB) -> do not seed overrides; flags stay SAFE-OFF.
    RETURN;
  END IF;

  INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
  SELECT f.flag_key, c.id, NULL::uuid, true, v_owner
  FROM (VALUES ('QBO_AP_MIRROR_PULL_ENABLED'), ('QBO_AP_BILLS_PROJECTION_ENABLED')) AS f(flag_key)
  CROSS JOIN org.companies c
  WHERE c.code IN ('TRANSP','TRK')
  ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
  DO UPDATE SET enabled = true, set_by_user_uuid = EXCLUDED.set_by_user_uuid, set_at = now(), expires_at = NULL;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_AP_MIRROR_PULL_ENABLED','QBO_AP_BILLS_PROJECTION_ENABLED')) AS flags_registered,
  (SELECT count(*) FROM lib.feature_flag_overrides
     WHERE flag_key IN ('QBO_AP_MIRROR_PULL_ENABLED','QBO_AP_BILLS_PROJECTION_ENABLED')
       AND user_uuid IS NULL AND enabled = true) AS entity_overrides_on;

-- ROLLBACK (manual, owner-gated):
--   UPDATE lib.feature_flag_overrides SET enabled=false
--     WHERE flag_key IN ('QBO_AP_MIRROR_PULL_ENABLED','QBO_AP_BILLS_PROJECTION_ENABLED') AND user_uuid IS NULL;
--   -- (catalog rows may remain; they are SAFE-OFF without an ON override.)
