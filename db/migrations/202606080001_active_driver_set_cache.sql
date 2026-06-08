-- GAP-25: Active Driver Set 15-min Recompute Cache
--
-- Creates integrations.active_driver_set_cache to store pre-computed active
-- driver sets per operating company.  Recomputed every 15 minutes by the
-- active-driver-set-recompute worker so SafetyHome filter (<100ms) replaces
-- the expensive per-request scan (>800ms at 40+ driver scale).
--
-- RLS-scoped on operating_company_id (lucia-bypass allowed for worker).
-- Retains up to 30 snapshots per OCI for trending; older rows purged by worker.
--
-- Additive + idempotent: IF NOT EXISTS on table/indexes, DROP POLICY IF EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS integrations.active_driver_set_cache (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  threshold_days INTEGER NOT NULL,
  active_driver_uuids UUID[] NOT NULL,
  total_driver_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adset_snapshot
  ON integrations.active_driver_set_cache (operating_company_id, snapshot_at DESC);

ALTER TABLE integrations.active_driver_set_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.active_driver_set_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS active_driver_set_cache_tenant_scope
  ON integrations.active_driver_set_cache;

CREATE POLICY active_driver_set_cache_tenant_scope
  ON integrations.active_driver_set_cache
  FOR ALL TO ih35_app
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT USAGE ON SCHEMA integrations TO ih35_app;
GRANT SELECT, INSERT, DELETE ON integrations.active_driver_set_cache TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS integrations.active_driver_set_cache;
