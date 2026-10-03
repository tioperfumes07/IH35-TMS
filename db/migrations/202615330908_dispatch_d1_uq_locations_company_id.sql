-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330908 · CC-3 · Dispatch D1 (the block, dispatch core) — mdata.locations gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330912 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_locations_company_id ON mdata.locations (operating_company_id, id);
