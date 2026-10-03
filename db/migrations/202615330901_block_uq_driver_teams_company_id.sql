-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330901 · CC-3 · ROUND 345 the block, phase 2 — mdata.driver_teams gets the (operating_company_id, id) unique key the same-entity
-- foreign keys in 202615330904 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_driver_teams_company_id ON mdata.driver_teams (operating_company_id, id);
