-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330917 · CC-3 · Dispatch D2a (the block, dispatch tables) — mdata.load_stops gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330923 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_load_stops_company_id ON mdata.load_stops (operating_company_id, id);
