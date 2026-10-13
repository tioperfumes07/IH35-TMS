-- 202615710935_seed_four_unseeded_flag_keys.sql
-- 443.99 C lane 3 (CC-3) — verify-flag-keys-seeded (step 3109): four flag keys are read by backend code through
-- isEnabled(), but no migration ever inserted them into lib.feature_flags. isEnabled() returns false BEFORE any
-- per-entity override is consulted when the flag row is missing, so the gated path can never be turned on.
-- Prod (read-only, 2026-10-12) carries RELATED_PARTY_LOAN_GL_POSTING_ENABLED and TONU_CANCELLATION_AR_POSTING_ENABLED
-- (seeded outside the migration chain), and lacks DSP_ASSIGN_CONFIRMATION_ENABLED and PM_AUTO_ENGINE_CREATE_WORK_ORDERS.
--
-- Seed-only, idempotent (ON CONFLICT DO NOTHING — an existing row, its default and its overrides are untouched).
-- Every key defaults OFF; turning one on stays a per-entity owner decision. No other data touched.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  ('DSP_ASSIGN_CONFIRMATION_ENABLED',
   'Dispatch quick-save assignment asks for confirmation before it commits (dispatch/assignments/quicksave.routes.ts). Default OFF.',
   false, 0),
  ('PM_AUTO_ENGINE_CREATE_WORK_ORDERS',
   'PM auto-engine creates work orders for due schedules; OFF = it only logs what it would create (maintenance/pm-auto-engine.service.ts). Default OFF.',
   false, 0),
  ('RELATED_PARTY_LOAN_GL_POSTING_ENABLED',
   'Related-party loan entries post to the GL per entity; OFF = zero writes, dry run only (accounting/related-party-loan-posting). Default OFF.',
   false, 0),
  ('TONU_CANCELLATION_AR_POSTING_ENABLED',
   'A cancelled load with a TONU fee posts its A/R invoice; per-entity override only (dispatch/cancellation-tonu-invoice.ts). Default OFF.',
   false, 0)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
