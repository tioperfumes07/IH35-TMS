-- IH35_MIGRATION_NO_TRANSACTION
-- 202615320903 · CC-3 · ROUND 345 the block, phase 1 — accounting.lease_asset_line gets the (operating_company_id, id) unique key a
-- same-entity foreign key references (202615320904). id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_lease_asset_line_company_id ON accounting.lease_asset_line (operating_company_id, id);
