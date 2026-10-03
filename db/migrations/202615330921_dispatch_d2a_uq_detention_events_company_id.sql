-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330921 · CC-3 · Dispatch D2a (the block, dispatch tables) — dispatch.detention_events gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330923 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_detention_events_company_id ON dispatch.detention_events (operating_company_id, id);
