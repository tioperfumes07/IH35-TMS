-- VENDOR-OPEN-BALANCE-INCLUDES-DRAFT-BILLS
--
-- accounting.vendor_balances' balance_cents SUM had NO status filter at all -- only
-- open_bill_count/next_due_date (via FILTER clauses) excluded draft/void bills. Every sibling
-- payables/receivables aggregate in this codebase (ap-aging.service.ts, fin20-aging.service.ts,
-- ar-aging.service.ts) agrees: a 'draft' bill is not yet a real obligation and must be excluded.
-- This view was the ONLY vendor-payables aggregate that silently included draft-bill amounts in
-- the headline "Open balance" figure shown on /vendors and the vendor profile page. Live-confirmed
-- on prod: LOVES TRAVEL STOPS (USMCA) showed "Open balance $605.00" while its own AP Aging section
-- on the same page correctly listed only $420.00 across 3 real open bills -- the exact $185.00 gap
-- traced to 2 status='draft' bills for that vendor.
--
-- Fix: add the SAME status filter open_bill_count/next_due_date already use
-- (status IN ('open','partial','partially_paid','unpaid')) to the balance_cents SUM, via a FILTER
-- clause -- no other column, join, or CTE changes. CREATE OR REPLACE VIEW is append-only for NEW
-- columns; this changes the WHERE-filter expression inside an EXISTING column (balance_cents),
-- which append-only does not restrict -- the column's position/name/type are unchanged.

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
