-- IMPORT-P0b — register the QBO_ENTITY_PUSH_ENABLED feature flag (default OFF).
--
-- Under the parallel-books architecture (docs/specs/ACCOUNTING-ARCHITECTURE.md) the QBO connection is
-- reconcile-only: TMS does NOT write back to QuickBooks. Today the six outbox entity-push handlers
-- (invoice/bill/customer/vendor/account/item, tms.*.push_requested → push.service.ts) are default-ON via
-- env var with no origin guard. This flag is LAYER 1 of the entity-push kill-switch: default OFF, resolved
-- PER ENTITY, enrolled in POSTING_FLAG_KEYS (feature-flags/service.ts) so a global default/rollout can
-- NEVER enable it for every entity — enable is an explicit per-entity (operating_company_id) override,
-- owner-controlled. LAYER 2 (structural refusal of any QBO-origin/cloned row) in qbo-entity-push-gate.ts
-- is independent of this flag.
--
-- Idempotent: ON CONFLICT DO NOTHING. lib.feature_flags is created by 202606071200_feature_flags.sql,
-- which sorts before this file.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('QBO_ENTITY_PUSH_ENABLED',
   'IMPORT-P0b: push TMS entities (invoice/bill/customer/vendor/account/item) INTO QuickBooks. QBO is system-of-record (no sync-back) — resolved per-entity via overrides, per-entity-only (POSTING_FLAG_KEYS). Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
