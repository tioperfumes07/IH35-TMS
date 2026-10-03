-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330925 · CC-3 · Dispatch D2b (the block, dispatch tables) — dispatch.non_owned_trailers gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330928 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_non_owned_trailers_company_id ON dispatch.non_owned_trailers (operating_company_id, id);
