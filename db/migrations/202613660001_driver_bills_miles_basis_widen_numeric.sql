BEGIN;

-- DRV-BILL-MILES-INTEGER (owner order 2026-09-04, live-blocking): the owner's real first
-- booking on load 13508 (miles_shortest=1478.1) threw
--   invalid input syntax for type integer: "1478.1"
-- driver_finance.driver_bills.miles_basis is integer, but it holds the MILES QUANTITY (proven
-- live: settlement-contract-terms.service.ts:222 `SELECT COALESCE(SUM(db.miles_basis),0) AS
-- miles`), not a type flag -- the type selector is the separate miles_basis_type (text) column
-- on the same table. book-load.service.ts binds load.miles_shortest / load.miles_practical
-- straight into miles_basis at both insert sites (team-split and single-driver), and
-- mdata.loads.miles_shortest/miles_practical/miles_deadhead/loaded_miles are all
-- numeric(10,1) -- the API (loads.routes.ts:251,:402) already publishes
-- z.number().min(0).multipleOf(0.1), so decimals are accepted by contract upstream. The
-- driver-bill column never honored that contract.
--
-- WIDEN, DO NOT ROUND: rounding 1478.1 to 1478 silently changes what the driver is paid
-- relative to the load it was created from -- the owner's money contract is traceable numbers.
-- numeric(10,1) matches mdata.loads' mileage columns exactly (the source of every value this
-- column ever receives) and is a superset of driver_bills.miles_basis's own sibling column
-- miles_deadhead (unconstrained numeric, already on this table).
--
-- rate_per_mile_cents and gross_amount_cents on this same table stay integer -- audited
-- (2026-09-04): cents are correctly whole-number; this migration does not touch them.
--
-- Idempotent by nature: ALTER COLUMN ... TYPE numeric(10,1) re-run against a column already at
-- that type is a no-op-equivalent re-validation, not an error.

ALTER TABLE driver_finance.driver_bills
  ALTER COLUMN miles_basis TYPE numeric(10,1) USING miles_basis::numeric(10,1);

COMMENT ON COLUMN driver_finance.driver_bills.miles_basis IS
  'Miles quantity the driver was paid on (short or practical, per miles_basis_type on this row) -- numeric(10,1) to match mdata.loads.miles_shortest/miles_practical/miles_deadhead, the source of every value written here. Widened from integer 2026-09-04 (DRV-BILL-MILES-INTEGER) -- the prior integer type rejected any decimal load mileage, e.g. 1478.1, forcing a hard failure on book/dispatch rather than a silent round.';

COMMIT;
