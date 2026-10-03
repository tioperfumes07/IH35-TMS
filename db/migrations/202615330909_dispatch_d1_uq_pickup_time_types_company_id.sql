-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330909 · CC-3 · Dispatch D1 (the block, dispatch core) — catalogs.pickup_time_types gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330912 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_pickup_time_types_company_id ON catalogs.pickup_time_types (operating_company_id, id);
