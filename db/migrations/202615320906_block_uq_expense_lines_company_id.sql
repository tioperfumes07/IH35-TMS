-- IH35_MIGRATION_NO_TRANSACTION
-- 202615320906 · CC-3 · ROUND 345 the block, phase 1b — accounting.expense_lines gets the (operating_company_id, id) unique key the same-entity
-- foreign key in 202615320908 references. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_expense_lines_company_id ON accounting.expense_lines (operating_company_id, id);
