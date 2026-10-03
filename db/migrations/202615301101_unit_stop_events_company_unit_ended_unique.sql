-- IH35_MIGRATION_NO_TRANSACTION
-- 202615301101 · CC-3 · ROUND 340.2 (2 of 3) — the end key: a stop clipped at the writer's window start (same end, later
-- start) can never be inserted as a second row again. One statement. Precondition (ROUND 340.2): 0 violations.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS unit_stop_events_company_unit_ended_unique ON telematics.unit_stop_events (operating_company_id, unit_id, ended_at);
