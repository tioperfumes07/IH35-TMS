-- ============================================================================
-- TIER-1 entity-independence hardening (Migration A of 2): per-entity isolation
-- of outbox.queue. BUILD-AND-HOLD — Jorge labels after GUARD Neon-verifies; do
-- NOT self-merge (RLS change on a sync/ops table; entity-independence is a hard rule).
-- ----------------------------------------------------------------------------
-- WHY (GUARD-verified live): outbox.queue has RLS DISABLED and no operating_company_id,
--   so views.qbo_sync_health's QBO "pending" count is GLOBAL across entities. Correct
--   today ONLY because TRANSP is the sole QBO-connected entity; it BLENDS the moment USMCA
--   connects (July 2026). PRE-EXISTING (the table was captured raw in 0201 with RLS
--   explicitly deferred), not introduced by any recent PR.
--
-- PRODUCER / CONSUMER MAP (verified by grep of apps/backend/src on 2026-06-29):
--   * The ONLY producer of outbox.queue is the lists-hub force-qbo-sync endpoint
--     (apps/backend/src/lists/lists-hub.routes.ts). It runs under withCurrentUser ->
--     SET LOCAL ROLE ih35_app + app.operating_company_id SET + app.bypass_rls NOT set.
--     The same change updates that INSERT to ALWAYS carry operating_company_id = the
--     scoped company, so its WITH CHECK passes under forced RLS.
--   * There is NO worker / drainer of outbox.queue anywhere in the repo. The QBO sync
--     crons + push-chain services (sync-with-retry.ts, sync-alerts-cron.ts, tms-*-push-
--     chain.service.ts) enqueue to the SEPARATE legacy tables outbox.events /
--     outbox.outbox_queue, NEVER outbox.queue. FORCE RLS therefore cannot stop a drainer
--     because none exists. The only readers are the security_invoker views
--     views.qbo_sync_health and views.catalogs_inventory, which run under the querying
--     user's app.operating_company_id context (Migration B scopes their counts).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP/CREATE POLICY,
--   ENABLE/FORCE are no-ops when already set. The column is LEFT NULLABLE on purpose — a
--   separate later migration sets NOT NULL only after every writer is confirmed and the
--   backfill is complete (see step 2).
-- ============================================================================

BEGIN;

-- 1. Add the scoping column (nullable first; NOT NULL is a later migration).
ALTER TABLE outbox.queue ADD COLUMN IF NOT EXISTS operating_company_id uuid;

-- 2. Backfill derivable rows. The only producer (lists-hub force_full_sync) writes
--    payload.operating_company_id, so derive from there when present + well-formed.
--    Rows whose payload carries no valid operating_company_id are LEFT NULL ON PURPOSE
--    -- we do NOT guess an opco. Such NULL rows are then visible only under lucia bypass
--    (the sentinel/global maintenance context), never to an entity-scoped session, which
--    is the safe default until the NOT-NULL migration. In current production the table
--    holds only force_full_sync markers that all carry the field; any legacy/other row
--    (if one exists) intentionally stays NULL.
UPDATE outbox.queue
   SET operating_company_id = (payload->>'operating_company_id')::uuid
 WHERE operating_company_id IS NULL
   AND payload ? 'operating_company_id'
   AND (payload->>'operating_company_id')
       ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- 3. Index for the per-entity pending lookup that views.qbo_sync_health performs
--    (operating_company_id, target_system, status all confirmed present on the table).
CREATE INDEX IF NOT EXISTS outbox_queue_opco_target_status_idx
  ON outbox.queue (operating_company_id, target_system, status);

-- 4. ENABLE + FORCE RLS, opco-scoped with the lucia bypass. FORCE so an owner/superuser
--    context cannot leak rows across entities. NULLIF-wrap the GUC cast so an unset/empty
--    app.operating_company_id yields NULL (no match) instead of a 22P02 cast error, and to
--    satisfy verify-rls-uuid-cast-nullif. NULL operating_company_id rows (un-backfilled)
--    are visible only under bypass, by design.
ALTER TABLE outbox.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.queue FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_queue_company_scope ON outbox.queue;
CREATE POLICY outbox_queue_company_scope
  ON outbox.queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR identity.is_lucia_bypass()
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR identity.is_lucia_bypass()
  );

COMMIT;
