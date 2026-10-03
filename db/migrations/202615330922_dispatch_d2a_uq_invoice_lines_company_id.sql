-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330922 · CC-3 · Dispatch D2a (the block, dispatch tables) — accounting.invoice_lines gets the (operating_company_id, id) unique key the
-- same-company foreign keys in 202615330923 reference. id is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_invoice_lines_company_id ON accounting.invoice_lines (operating_company_id, id);
