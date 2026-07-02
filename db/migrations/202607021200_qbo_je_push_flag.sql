-- IMPORT-P0 — register the QBO_JE_PUSH_ENABLED feature flag (default OFF).
--
-- QBO is the system of record through 12/31/2025 (double books + a reconciliation module — NO sync-back;
-- see the CPA-locked decisions). Today apps/backend/src/accounting/journal-entry-qbo-push.service.ts has
-- NO gate: an imported / QBO-origin journal entry would POST straight back into QuickBooks. This flag is
-- LAYER 1 of the kill-switch: default OFF, resolved PER ENTITY. It is also enrolled in POSTING_FLAG_KEYS
-- (feature-flags/service.ts) so a global default/rollout can NEVER turn it on for every entity — enable is
-- an explicit per-entity (operating_company_id) override, owner-controlled. LAYER 2 (structural refusal of
-- any non-'tms' source_system) in the push service is independent of this flag and can never be flipped away.
--
-- Idempotent: ON CONFLICT DO NOTHING; re-running is a no-op. lib.feature_flags is created by an earlier
-- migration (202606071200_feature_flags.sql), which sorts before this file.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('QBO_JE_PUSH_ENABLED',
   'IMPORT-P0: push TMS journal entries INTO QuickBooks. QBO is system-of-record (no sync-back) — resolved per-entity via overrides, per-entity-only (POSTING_FLAG_KEYS). Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
