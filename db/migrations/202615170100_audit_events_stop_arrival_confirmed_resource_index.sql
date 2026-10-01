-- IH35_MIGRATION_NO_TRANSACTION
-- DEPLOY-BLOCKER-ROOT-CAUSE-SCORER-HOUR-LONG-QUERY-2026100107 (Lead, claude band HH 01)
--
-- Measured on prod 2026-10-01 06:4xZ-07:0xZ (pg_stat_activity / pg_locks, neondb_owner): the customer
-- relationship scorer's boot-time tick ran scorer.service.ts:166 ("WITH completed AS ...") for 1 h 03 min
-- (pgbouncer pid 24562), holding AccessShareLock on mdata.loads and 135 other relations. Every
-- ALTER TABLE mdata.loads (202615160000) then failed its 5 s lock_timeout at pre-deploy and every seat's
-- deploy was blocked. Splitting the run into per-customer transactions (#23749) shortens the lock window
-- but not the query: STOP_ARRIVAL_EVENTS_SQL's LATERAL confirmation lookup
--   WHERE ae.event_class = 'dispatch.stop_arrival_confirmed' AND ae.payload->>'resource_id' = ge.id::text
-- is served by the pg_trgm GIN on event_class (EXPLAIN: Bitmap Index Scan idx_audit_events_event_class_trgm
-- cost 3022, then a Filter on payload->>'resource_id') and runs once per 'entered' fence event (499 live)
-- over 2,866,956 audit rows. That is the hour.
--
-- Fix: a partial expression btree. Zero rows today (0 confirmations), so it is instant to build and keeps
-- the lookup O(log n) forever. Read-side index only; no data changed. CONCURRENTLY, one statement, no txn.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_stop_arrival_confirmed_resource
  ON audit.audit_events ((payload->>'resource_id'), created_at DESC)
  WHERE event_class = 'dispatch.stop_arrival_confirmed';
