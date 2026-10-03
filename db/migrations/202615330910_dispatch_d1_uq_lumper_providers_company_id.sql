-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330910 · CC-3 · Dispatch D1 (the block, dispatch core) — catalogs.lumper_providers gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330912 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_lumper_providers_company_id ON catalogs.lumper_providers (operating_company_id, id);
