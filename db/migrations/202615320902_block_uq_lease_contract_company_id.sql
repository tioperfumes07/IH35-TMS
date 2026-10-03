-- IH35_MIGRATION_NO_TRANSACTION
-- 202615320902 · CC-3 · ROUND 345 the block, phase 1 — accounting.lease_contract gets the (operating_company_id, id) unique key a
-- same-entity foreign key references (202615320904). id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_lease_contract_company_id ON accounting.lease_contract (operating_company_id, id);
