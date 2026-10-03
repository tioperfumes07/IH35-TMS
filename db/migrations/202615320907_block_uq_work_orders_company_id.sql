-- IH35_MIGRATION_NO_TRANSACTION
-- 202615320907 · CC-3 · ROUND 345 the block, phase 1b — maintenance.work_orders gets the (operating_company_id, id) unique key the same-entity
-- foreign key in 202615320908 references. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_work_orders_company_id ON maintenance.work_orders (operating_company_id, id);
