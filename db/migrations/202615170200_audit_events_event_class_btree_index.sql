-- IH35_MIGRATION_NO_TRANSACTION
-- DEPLOY-BLOCKER-ROOT-CAUSE-SCORER-HOUR-LONG-QUERY-2026100107 (Lead, claude band HH 02) -- sibling of 202615170100.
--
-- audit.audit_events (2.87M rows) carries only the pkey and a pg_trgm GIN on event_class (for the ILIKE
-- report filters). Every EQUALITY reader of event_class -- stop-arrival confirm/dismiss, detention, E-25
-- sync, reclassify audit, customer-notify -- is answered by a GIN trigram bitmap (cost 3022 per probe,
-- recheck on every candidate). A plain btree on (event_class, created_at DESC) answers equality and the
-- usual ORDER BY created_at DESC LIMIT 1 directly. Read-side index only; no data changed.
-- CONCURRENTLY: no write lock on the audit stream while it builds. One statement, no transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_event_class_created_at
  ON audit.audit_events (event_class, created_at DESC);
