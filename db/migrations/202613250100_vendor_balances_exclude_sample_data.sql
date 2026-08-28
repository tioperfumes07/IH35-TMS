-- VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE (GO-0009 G1) — accounting.vendor_balances (the view behind
-- the "Open balance" figure on /vendors and the vendor profile page) has no is_sample_data filter
-- at all, so a demo/test bill (accounting.bills.is_sample_data = true, e.g. the CC3-BILL-0001 /
-- SAMPLE-* / TEST-* fixtures backfilled by the same GO-0009 pass this migration ships with)
-- inflates the same headline balance the previous fix (202613190000, draft-bill exclusion) already
-- corrected for status. Same fix shape: CREATE OR REPLACE VIEW changing the WHERE-filter inside an
-- EXISTING CTE (`normalized`), not adding/removing/retyping a column — additive-only per that
-- migration's own established precedent.
--
-- ap-aging.service.ts and ar-aging.service.ts get the identical is_sample_data exclusion in the
-- same GO-0009 pass (app-code change, no migration needed there).

BEGIN;

CREATE OR REPLACE VIEW accounting.vendor_balances
WITH (security_invoker = true) AS
WITH normalized AS (
  SELECT
    b.operating_company_id,
    COALESCE(NULLIF(b.vendor_id, ''), NULLIF(b.vendor_uuid, '')) AS vendor_id,
    GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0::bigint) AS amount_cents,
    LEAST(
      GREATEST(
        COALESCE(
          b.paid_cents,
          CASE
            WHEN b.status = 'paid' THEN COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint)
            WHEN b.status = ANY (ARRAY['partial', 'partially_paid']) THEN ROUND(COALESCE(b.paid_amount, 0) * 100)::bigint
            ELSE 0::bigint
          END
        ),
        0::bigint
      ),
      GREATEST(COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint), 0::bigint)
    ) AS paid_cents,
    b.bill_date,
    b.due_date,
    b.status,
    b.revoked_at
  FROM accounting.bills b
  WHERE b.is_sample_data = false
)
SELECT
  operating_company_id,
  vendor_id,
  COALESCE(
    SUM(amount_cents - paid_cents) FILTER (
      WHERE status = ANY (ARRAY['open', 'partial', 'partially_paid', 'unpaid'])
    ),
    0
  )::bigint AS balance_cents,
  COUNT(*) FILTER (
    WHERE status = ANY (ARRAY['open', 'partial', 'partially_paid', 'unpaid'])
      AND amount_cents > paid_cents
      AND revoked_at IS NULL
  )::integer AS open_bill_count,
  MIN(due_date) FILTER (
    WHERE status = ANY (ARRAY['open', 'partial', 'partially_paid', 'unpaid'])
      AND amount_cents > paid_cents
      AND revoked_at IS NULL
  ) AS next_due_date,
  MAX(bill_date) AS last_bill_date
FROM normalized n
WHERE vendor_id IS NOT NULL AND revoked_at IS NULL
GROUP BY operating_company_id, vendor_id;

GRANT SELECT ON accounting.vendor_balances TO ih35_app;

COMMIT;
