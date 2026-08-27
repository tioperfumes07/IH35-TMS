-- AUDIT-EVENTS-EVENT-CLASS-FULL-TABLE-SCAN-EVERY-REPORT-LOAD
--
-- Every /reports/audit/* route that reads audit.audit_events filters on
-- event_class ILIKE ANY(ARRAY['%...%', ...]) (void-reversal, deduction-trail,
-- activity-by-module, financial-change-log, maintenance-decision-log,
-- period-close-history, activity-by-user). A leading-wildcard ILIKE can never
-- use a plain btree index, so every one of these requests forces a full
-- Seq Scan over the whole table. Confirmed live (br-fancy-credit-akjnd07a,
-- EXPLAIN ANALYZE) at 2,712,346 rows: 8,359 ms per deduction-trail request
-- alone, growing worse as the table grows (qbo_archive.batch_audit_logged
-- contributes ~1.7M rows by itself).
--
-- Fix: a pg_trgm GIN index on event_class. Confirmed live this drops the
-- SAME query to 0.8-1.7 ms across all 3 tested filter patterns (deduction-
-- trail's, void-reversal's, period-close-history's) -- a single index fixes
-- every sibling, not just one route. pg_trgm is already enabled on this
-- database. CREATE INDEX CONCURRENTLY was applied directly on prod first (to
-- avoid locking a 2.7M-row table) -- this migration's plain IF NOT EXISTS
-- form is a no-op there and creates the index normally everywhere else
-- (fresh/local DBs, where the table is empty and a lock is a non-issue).
--
-- Read-side index only. No GL/posting logic touched, no data changed.

CREATE INDEX IF NOT EXISTS idx_audit_events_event_class_trgm
  ON audit.audit_events
  USING gin (event_class gin_trgm_ops);
