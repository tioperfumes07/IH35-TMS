-- 0441-mod7-myaccountant-flag-no-seed — register the My Accountant UI feature flag (default OFF).
--
-- MyAccountantPage.tsx gates itself in the frontend via useFeatureFlag("MY_ACCOUNTANT_ENABLED", opco)
-- (-> /api/feature-flags/check -> isEnabled), but no db/migrations/ row ever seeded that key into
-- lib.feature_flags. With no row, isEnabled() correctly resolves to OFF (see service.ts: `if (!flag)
-- return false;`) — so the surface was already safely OFF — but the flag was undiscoverable and
-- un-manageable: an owner could not grant a per-entity override in the admin Feature Flags manager,
-- because lib.feature_flag_overrides.flag_key has a FK to lib.feature_flags(flag_key) — inserting an
-- override for a key that was never seeded fails the FK, not "flip enabled". This migration seeds the
-- SINGLE canonical row so the flag is visible + a per-entity override becomes possible.
--
-- My Accountant is a READ-ONLY accountant workspace (period status, report links, CPA export
-- downloads only — see MyAccountantPage.guard.test.ts, which asserts zero POST/PUT/PATCH/DELETE and no
-- period-close/journal-entry/posting-batch/void writes) scoped to one operating_company_id at a time
-- (no cross-entity totals). Same pattern as FINANCE_HUB_UI_ENABLED / QBO_RECONCILE_UI_ENABLED /
-- AR_AP_AGING_UI_ENABLED / FINANCE_BREAK_EVEN_UI_ENABLED (202607050100 / 202607050900): registered in
-- PER_ENTITY_ONLY_FLAG_KEYS (service.ts) so a global default_enabled/rollout_pct can never turn it on
-- for every entity at once — enable is an explicit per-entity (operating_company_id) owner (Jorge)
-- override.
--
-- Default OFF: this migration does not enable the surface anywhere. Additive, idempotent
-- (ON CONFLICT DO NOTHING) — safe to re-run; never flips an existing row.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'MY_ACCOUNTANT_ENABLED',
  'My Accountant read-only accountant workspace (period status, report links, CPA export). Per-entity-only (owner-flipped via override); never posts/writes. Default OFF.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key = 'MY_ACCOUNTANT_ENABLED';
