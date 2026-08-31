-- INV-OPEN-VOID-01 (owner-verified live, worsening in real time 2026-09-01: 41 voided invoices /
-- $72,237.34 phantom open A/R, was 33 / $45,837.34 four hours earlier, driven by the owner's own
-- in-progress voiding session tonight -- every void ADDS its full face value to phantom open A/R).
--
-- ROOT CAUSE: accounting.invoices.amount_open_cents is GENERATED ALWAYS AS
-- (total_cents - amount_paid_cents) with no knowledge of voided_at. Voiding an unpaid/partially-paid
-- invoice does NOT change total_cents or amount_paid_cents, so amount_open_cents keeps reporting the
-- full remaining balance as still owed, forever, for a document that no longer exists financially.
-- The identical blind spot exists on accounting.payments.amount_unapplied_cents ($8,137.25 exposure)
-- and accounting.vendor_credits.amount_unapplied_cents ($350.00 exposure) -- vendor_credits has no
-- voided_at column at all (status='voided' is its marker, per vendor-credits.routes.ts), and voiding
-- a vendor credit already zeroes amount_applied_cents there, which makes its own
-- amount_unapplied_cents computation WORSE, not neutral: a voided credit reads as fully unapplied.
--
-- Devin-A's independent audit (GUARD-WORKORDER-MONEY-COLUMN-VOID.md) confirmed all 5 downstream
-- consumers already filter voided_at IS NULL / equivalent -- this is a reporting-accuracy defect,
-- not a customer-facing dunning risk.
--
-- views.ar_aging depends on invoices.amount_open_cents and accounting.idx_payments_unapplied is a
-- partial index on payments.amount_unapplied_cents -- both must be dropped before the generated
-- column can be dropped, and are recreated afterward. NOT byte-identical: pg_get_viewdef() only
-- prints the SELECT body, never the view's reloptions, so a naive copy silently drops the original's
-- WITH (security_invoker = true) (set in 0060_p3_t11_20_1_accounting_invoices_schema.sql /
-- 0123_p6_pre_ledger_drift_reconciliation.sql) -- caught by ih35-migration-guard review before ship;
-- the recreated view restores that option explicitly, and the recreated grant restores
-- `TO ih35_app` (a DROP VIEW destroys its ACL along with it; recreating it defaults to nobody until
-- granted, so the grant is re-stated to the SAME role the original had, not TO PUBLIC).
--
-- Idempotent: each column fix checks pg_attrdef's actual generation expression first and no-ops if
-- already fixed, so a partial or repeated run is safe; DROP COLUMN IF EXISTS so a retry where the
-- column was already dropped mid-run (should the transaction ever not roll back cleanly) does not
-- itself throw.

BEGIN;

DROP VIEW IF EXISTS views.ar_aging;
DROP INDEX IF EXISTS accounting.idx_payments_unapplied;

-- accounting.invoices.amount_open_cents
DO $$
DECLARE
  v_expr text;
BEGIN
  SELECT pg_get_expr(ad.adbin, ad.adrelid) INTO v_expr
  FROM pg_attribute att
  JOIN pg_attrdef ad ON ad.adrelid = att.attrelid AND ad.adnum = att.attnum
  WHERE att.attrelid = 'accounting.invoices'::regclass AND att.attname = 'amount_open_cents';

  IF v_expr IS NULL OR v_expr NOT ILIKE '%voided_at%' THEN
    ALTER TABLE accounting.invoices DROP COLUMN IF EXISTS amount_open_cents;
    ALTER TABLE accounting.invoices ADD COLUMN amount_open_cents bigint
      GENERATED ALWAYS AS (
        CASE WHEN voided_at IS NOT NULL THEN 0 ELSE total_cents - amount_paid_cents END
      ) STORED;
  END IF;
END
$$;

-- accounting.payments.amount_unapplied_cents
DO $$
DECLARE
  v_expr text;
BEGIN
  SELECT pg_get_expr(ad.adbin, ad.adrelid) INTO v_expr
  FROM pg_attribute att
  JOIN pg_attrdef ad ON ad.adrelid = att.attrelid AND ad.adnum = att.attnum
  WHERE att.attrelid = 'accounting.payments'::regclass AND att.attname = 'amount_unapplied_cents';

  IF v_expr IS NULL OR v_expr NOT ILIKE '%voided_at%' THEN
    ALTER TABLE accounting.payments DROP COLUMN IF EXISTS amount_unapplied_cents;
    ALTER TABLE accounting.payments ADD COLUMN amount_unapplied_cents bigint
      GENERATED ALWAYS AS (
        CASE WHEN voided_at IS NOT NULL THEN 0 ELSE amount_cents - amount_applied_cents END
      ) STORED;
  END IF;
END
$$;

-- accounting.vendor_credits.amount_unapplied_cents (status='voided', no voided_at column here)
DO $$
DECLARE
  v_expr text;
BEGIN
  SELECT pg_get_expr(ad.adbin, ad.adrelid) INTO v_expr
  FROM pg_attribute att
  JOIN pg_attrdef ad ON ad.adrelid = att.attrelid AND ad.adnum = att.attnum
  WHERE att.attrelid = 'accounting.vendor_credits'::regclass AND att.attname = 'amount_unapplied_cents';

  IF v_expr IS NULL OR v_expr NOT ILIKE '%status%' THEN
    ALTER TABLE accounting.vendor_credits DROP COLUMN IF EXISTS amount_unapplied_cents;
    ALTER TABLE accounting.vendor_credits ADD COLUMN amount_unapplied_cents bigint
      GENERATED ALWAYS AS (
        CASE WHEN status = 'voided' THEN 0 ELSE amount_cents - amount_applied_cents END
      ) STORED;
  END IF;
END
$$;

-- Recreate views.ar_aging: SELECT body from pg_get_viewdef captured live 2026-09-01, reloptions
-- (WITH security_invoker) and grant restored explicitly since pg_get_viewdef never prints either --
-- already filters voided_at IS NULL at the view level, so this fix is additive belt-and-suspenders
-- for that view specifically, but load-bearing for every OTHER consumer of amount_open_cents that
-- does not carry its own voided_at filter.
CREATE VIEW views.ar_aging
WITH (security_invoker = true)
AS
 SELECT i.operating_company_id,
    i.customer_id,
    c.customer_name,
    count(*) FILTER (WHERE i.amount_open_cents > 0) AS open_invoice_count,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date >= CURRENT_DATE), 0::numeric) AS current_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < CURRENT_DATE AND i.due_date >= (CURRENT_DATE - 30)), 0::numeric) AS bucket_1_30_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 30) AND i.due_date >= (CURRENT_DATE - 60)), 0::numeric) AS bucket_31_60_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 60) AND i.due_date >= (CURRENT_DATE - 90)), 0::numeric) AS bucket_61_90_cents,
    COALESCE(sum(i.amount_open_cents) FILTER (WHERE i.due_date < (CURRENT_DATE - 90)), 0::numeric) AS bucket_91_plus_cents,
    COALESCE(sum(i.amount_open_cents), 0::numeric) AS total_open_cents
   FROM accounting.invoices i
     JOIN mdata.customers c ON c.id = i.customer_id
  WHERE (i.status = ANY (ARRAY['sent'::text, 'partial'::text])) AND i.voided_at IS NULL
  GROUP BY i.operating_company_id, i.customer_id, c.customer_name;

GRANT SELECT ON views.ar_aging TO ih35_app;

CREATE INDEX IF NOT EXISTS idx_payments_unapplied ON accounting.payments
  USING btree (operating_company_id)
  WHERE (amount_unapplied_cents > 0 AND voided_at IS NULL);

-- Sanity: no voided document may report a nonzero open/unapplied balance after this migration.
DO $$
DECLARE
  v_bad_invoices bigint;
  v_bad_payments bigint;
  v_bad_credits bigint;
BEGIN
  SELECT count(*) INTO v_bad_invoices FROM accounting.invoices WHERE voided_at IS NOT NULL AND amount_open_cents <> 0;
  SELECT count(*) INTO v_bad_payments FROM accounting.payments WHERE voided_at IS NOT NULL AND amount_unapplied_cents <> 0;
  SELECT count(*) INTO v_bad_credits FROM accounting.vendor_credits WHERE status = 'voided' AND amount_unapplied_cents <> 0;

  IF v_bad_invoices <> 0 THEN
    RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided invoices still report nonzero amount_open_cents', v_bad_invoices;
  END IF;
  IF v_bad_payments <> 0 THEN
    RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided payments still report nonzero amount_unapplied_cents', v_bad_payments;
  END IF;
  IF v_bad_credits <> 0 THEN
    RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided vendor_credits still report nonzero amount_unapplied_cents', v_bad_credits;
  END IF;
END
$$;

COMMIT;
