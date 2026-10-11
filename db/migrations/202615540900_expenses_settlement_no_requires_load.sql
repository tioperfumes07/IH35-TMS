-- 202615540900_expenses_settlement_no_requires_load.sql
-- CC-3 · OWNER RULING (Lead 443.52 B): an expense that names a settlement must name its load. A settlement pays loads, so a
-- settlement expense with no load can never be attributed, drilled to its trip, or tied to the signed document. Write-time
-- refusal for EVERY writer (Creator, bank categorize, manual, imports): a CHECK on accounting.expenses.
-- Measured on prod 2026-10-11 11:15 UTC over ALL companies: USMCA 647 expenses (642 with a settlement number), TRANSP 27,070
-- (0 with a settlement number); 0 violate. Added NOT VALID, then VALIDATEd in the same transaction. Additive; writes no rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_settlement_no_requires_load') THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_settlement_no_requires_load
      CHECK (settlement_no IS NULL OR btrim(settlement_no) = '' OR load_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_settlement_no_requires_load;

COMMIT;
