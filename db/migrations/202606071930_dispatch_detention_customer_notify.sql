-- Block H: Detention approval → auto-notify customer (dispute-prevention email).
-- Additive only. Adds an idempotency stamp to the detention approval queue and
-- seeds the feature flag that gates the customer notification (default OFF).
--
-- 1) dispatch.detention_requests.customer_notified_at — set once after a
--    successful customer email send. The email path is keyed on this column
--    (send only when IS NULL) so each approval produces at most one customer
--    notification (idempotent on the detention_request row).
-- 2) lib.feature_flags seed: 'detention_customer_notify_email' (default_enabled
--    = false). First enable is a per-tenant override on one verified test
--    customer. isEnabled() returns false when the flag is absent, so the seed is
--    purely to surface the flag in the Owner admin UI — the gate is OFF until an
--    explicit override is created.
--
-- Self-contained GRANT block (Block A schema-grant gate) — keep independent so
-- it applies cleanly in any order.
--
-- NOTE: dispatch.detention_requests was introduced in the same sprint by
-- migrations 20260607_190000_dispatch_detention_requests.sql (Block 6 / #686).
-- Those files use the YYYYMMDD_HHMMSS_ format that db-migrate.mjs skips in the
-- CI verify DB; in production they are applied via the manual migration protocol.
-- We guard the ALTER TABLE with a table-existence check so this migration is a
-- clean no-op in CI (table absent) while still adding the column in production.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'dispatch' AND table_name = 'detention_requests'
  ) THEN
    ALTER TABLE dispatch.detention_requests
      ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz NULL;
  END IF;
END
$$;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'detention_customer_notify_email',
  'Block H — email the customer a detention charge notice when a detention request is approved/invoiced. Default OFF; enable per-tenant on a verified sender identity.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- Self-contained GRANT block.
GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.detention_requests TO ih35_app;
GRANT USAGE ON SCHEMA lib TO ih35_app;
GRANT SELECT ON lib.feature_flags TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA dispatch GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

COMMIT;
