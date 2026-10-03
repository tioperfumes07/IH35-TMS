-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330903 · CC-3 · ROUND 345 the block, phase 2 — driver_finance.auto_deduction_policies gets the (operating_company_id, id) unique key the same-entity
-- foreign keys in 202615330904 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_auto_deduction_policies_company_id ON driver_finance.auto_deduction_policies (operating_company_id, id);
