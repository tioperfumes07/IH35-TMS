-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330920 · CC-3 · Dispatch D2a (the block, dispatch tables) — dispatch.detention_requests gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330923 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_detention_requests_company_id ON dispatch.detention_requests (operating_company_id, id);
