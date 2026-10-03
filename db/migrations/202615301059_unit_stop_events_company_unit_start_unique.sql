-- IH35_MIGRATION_NO_TRANSACTION
-- 202615301059 · CC-3 · ROUND 340.2 (1 of 3) — the start key carries the company. Replaces unit_stop_events_unit_start_unique
-- (unit_id, started_at), dropped by 202615301102. One statement: the runner executes a no-transaction file as one query.
-- Preconditions verified on prod by the Lead (ROUND 340.2): 0 violations of (operating_company_id, unit_id, started_at).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS unit_stop_events_company_unit_start_unique ON telematics.unit_stop_events (operating_company_id, unit_id, started_at);
