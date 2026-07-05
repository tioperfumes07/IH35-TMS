-- FINHUB-1 — register the Finance Hub UI feature flag (default OFF).
--
-- AF-6 Finance Hub is a READ-ONLY landing dashboard (aggregates existing read surfaces; never posts,
-- never writes). Previously its backend gate read process.env.FINANCE_HUB_UI_ENABLED while the frontend
-- gated the same surface via the lib.feature_flags flag of the same name (through useFeatureFlag ->
-- /api/feature-flags/check -> isEnabled). With no DB row seeded, the two sides could disagree
-- (split-brain). This migration seeds the SINGLE canonical flag both sides now resolve.
--
-- The backend route now resolves this exact flag via isEnabled(client, 'FINANCE_HUB_UI_ENABLED', {opco,user}),
-- and the flag is registered in PER_ENTITY_ONLY_FLAG_KEYS so global default_enabled/rollout_pct can never
-- turn it on — enable is an explicit per-entity (operating_company_id) override, an owner (Jorge) sign-off.
--
-- Default OFF: this migration DOES NOT enable the hub. It only makes both sides read one source of truth.
-- Additive, idempotent (ON CONFLICT DO NOTHING) — safe to re-run; never flips an existing row.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('FINANCE_HUB_UI_ENABLED',
        'AF-6 Finance Hub read-only landing dashboard. Per-entity-only (owner-flipped via override); never posts/writes. Default OFF.',
        false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='FINANCE_HUB_UI_ENABLED';
