-- 202616020300_sync_alerts_schema_converge.sql
-- LEAD 443.199 — qbo.sync_alerts: a freshly migrated database and production disagree.
-- MEASURED 2026-10-17:
--   production (PG 16.15): kind text NOT NULL, message text NOT NULL, operation NULL-able; NO entity_type / error_message.
--   fresh DB from migrations (CI, DR restore, new Neon branch): 0144_qbo_sync_observability_and_alerts.sql created
--     entity_type text NOT NULL, error_message text NOT NULL, operation text NOT NULL, and later migrations added kind /
--     message NULL-able. Production's table predates 0144 (CREATE TABLE IF NOT EXISTS skipped), so 0144's columns never
--     existed there.
-- The application writes kind / message (guard verify-sync-alerts-column-names: "INSERT statements must use live DB
-- column names"), so on any database built from source every real writer dies on entity_type / error_message NOT NULL.
-- FIX (no-op on production): where the legacy 0144 columns exist, they stop being required; operation becomes NULL-able
-- as on production. No column is dropped (append-only law); no data touched. Idempotent, fresh-DB safe.
DO $$
BEGIN
  IF to_regclass('qbo.sync_alerts') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'qbo' AND table_name = 'sync_alerts' AND column_name = 'entity_type' AND is_nullable = 'NO') THEN
    ALTER TABLE qbo.sync_alerts ALTER COLUMN entity_type DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'qbo' AND table_name = 'sync_alerts' AND column_name = 'error_message' AND is_nullable = 'NO') THEN
    ALTER TABLE qbo.sync_alerts ALTER COLUMN error_message DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'qbo' AND table_name = 'sync_alerts' AND column_name = 'operation' AND is_nullable = 'NO') THEN
    ALTER TABLE qbo.sync_alerts ALTER COLUMN operation DROP NOT NULL;
  END IF;
END $$;
