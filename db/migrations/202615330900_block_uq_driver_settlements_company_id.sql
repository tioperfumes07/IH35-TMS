-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330900 · CC-3 · ROUND 345 the block, phase 2 — driver_finance.driver_settlements gets the (operating_company_id, id) unique key the same-entity
-- foreign keys in 202615330904 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_driver_settlements_company_id ON driver_finance.driver_settlements (operating_company_id, id);
