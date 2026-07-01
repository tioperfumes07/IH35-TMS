-- 202607010020_void_qbo_mirror_flag.sql
-- [HOLD-FOR-JORGE — TIER 1] Task #24 — register VOID_QBO_MIRROR_ENABLED in lib.feature_flags, DEFAULT OFF,
-- so the TMS->QBO void mirror resolves PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed on
-- operating_company_id) instead of a global read. NEVER self-merge — financial governance control (§1.4).
--
-- Behind this flag: the void->QBO mirror hook on the governance void/cancel register
-- (governance/void-cancel-requests.routes.ts approve path). While OFF (now), a void writes NOTHING to
-- QuickBooks — the register surfaces "also void in QuickBooks" guidance. When later flipped ON per entity
-- (Jorge's OK), the hook would mirror the void to QBO (that ON branch is NOT built in this block).
-- isEnabled() already returns false when the row is absent, so this is safe-OFF either way; registering the
-- row simply makes it manageable via per-company overrides WITHOUT turning anything on. Idempotent. No GL.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('VOID_QBO_MIRROR_ENABLED',
   'Task #24: mirror a TMS financial void to QuickBooks. Resolved per-entity via overrides. Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK:
-- DELETE FROM lib.feature_flags WHERE flag_key = 'VOID_QBO_MIRROR_ENABLED';
