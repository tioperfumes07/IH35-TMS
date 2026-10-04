-- 202615400700_reefer_fuel_type_from_relay_product.sql
-- ROUND 391.2 (CC-2) — reefer fuel_type comes FROM THE FEED's product code, never inferred.
--
-- Relay's fuel feed classifies every product line (integrations.relay_fuel_transaction_lines.fuel_type, product code
-- 033 "Reefer"). On USMCA 9 Reefer lines (632.8 gal) exist in the feed, but every USMCA fuel.fuel_transactions row came
-- in through the settlement import as fuel_type 'diesel' — so reefer gallons sat in IFTA as taxable road fuel and could
-- not be totalled for the federal (Form 4136) reefer-fuel credit.
--
-- This corrects only the rows the feed PROVES are reefer: a fuel row whose unit is the Relay transaction's matched unit,
-- whose date is within one day of the Relay transaction, and whose gallons equal the Reefer line's volume to the
-- thousandth — and only when that match is ONE-TO-ONE in both directions (no candidate is chosen between). Measured
-- 2026-10-04: 4 rows, 202.770 gal (all location_state NULL -> the UNKNOWN jurisdiction on the IFTA return). The other
-- 5 Reefer lines have no such row; they are read from the feed directly by the Reefer fuel credit report.
--
-- No money moves (fuel_type is a category on the fuel transaction; postings are untouched). The IFTA aggregator already
-- excludes 'reefer_diesel'. Frozen companies are never touched (USMCA only, by code). Idempotent: a row already
-- 'reefer_diesel' is not matched again.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

WITH usmca AS (
  SELECT id FROM org.companies WHERE code = 'USMCA'
),
reefer_lines AS (
  SELECT l.id AS line_id, t.matched_unit_id AS unit_id, (t.relay_created_at)::date AS d, round(l.volume::numeric, 3) AS gal,
         t.operating_company_id
    FROM integrations.relay_fuel_transaction_lines l
    JOIN integrations.relay_fuel_transactions t ON t.id = l.relay_fuel_transaction_id
   WHERE l.operating_company_id IN (SELECT id FROM usmca)
     AND l.fuel_type = 'reefer'
     AND l.voided_at IS NULL AND t.voided_at IS NULL
     AND t.matched_unit_id IS NOT NULL AND l.volume > 0
),
candidates AS (
  SELECT rl.line_id, ft.id AS fuel_id
    FROM reefer_lines rl
    JOIN fuel.fuel_transactions ft
      ON ft.operating_company_id = rl.operating_company_id
     AND ft.unit_id = rl.unit_id
     AND round(ft.gallons::numeric, 3) = rl.gal
     AND abs(COALESCE(ft.purchased_at, ft.transaction_at)::date - rl.d) <= 1
   WHERE ft.voided_at IS NULL AND ft.archived_at IS NULL AND ft.fuel_type = 'diesel'
),
one_to_one AS (
  SELECT c.fuel_id
    FROM candidates c
   WHERE (SELECT count(*) FROM candidates x WHERE x.line_id = c.line_id) = 1
     AND (SELECT count(*) FROM candidates y WHERE y.fuel_id = c.fuel_id) = 1
)
UPDATE fuel.fuel_transactions ft
   SET fuel_type = 'reefer_diesel'
 WHERE ft.id IN (SELECT fuel_id FROM one_to_one);

COMMIT;
