-- FINDING: ACCT-F11103 (part 2) — an application with no live money behind it still reduced the open A/R balance.
--
-- QuickBooks rule: an invoice's open balance = total − applications of NON-VOIDED payments − applications of NON-VOIDED
-- credit memos. Nothing else relieves A/R in the subledger.
--
-- ROOT CAUSE (measured on the tree at d0d20344ae, 202616400100):
--   1. A payment-less application (payment_id NULL — the factoring poster's / Faro short-pay's relief, ACCT-F11070) carried
--      NO link to the journal entry whose Cr ar_control is the real relief. accounting.invoice_applied_cents_as_of() counted
--      every payment-less row it found, so a payment-less row with no posted A/R credit behind it — or whose JE was later
--      voided / reversed — kept reducing amount_paid_cents, views.ar_aging and accounting.ar_aging_as_of() while the GL
--      A/R account carried the full amount: subledger < GL.
--   2. A payment's applications were archived (unapplied_at) only by payment-void-stamp.service.ts. A payment voided by any
--      other writer (SQL, QBO inbound, a future door) left its applications live, and accounting.recompute_invoice_paid()
--      only fires on payment_applications — so amount_paid_cents / views.ar_aging kept the voided payment's cents.
--   3. ar_aging_as_of() netted credit_memo_applications with `voided_at IS NULL` only — the credit memo's own void was not
--      read, and a void after the as-of date erased the credit from earlier dates.
--
-- FIX (no GL math; subledger only):
--   - payment_applications.source_journal_entry_id (FK accounting.journal_entries, same company): the JE whose Cr
--     ar_control IS the payment-less relief. CHECK: an application has a payment OR a source JE (NOT VALID — new rows only;
--     USMCA has 0 payment_applications today, measured 2026-11-04).
--   - accounting.journal_entry_live_as_of(je, as_of): posted, not voided and not reversed on/before the date.
--   - accounting.invoice_applied_cents_as_of(): a payment-backed application counts while its payment is not voided; a
--     payment-less one counts ONLY while its source JE is live — no source, no relief.
--   - trigger on accounting.payments: voided_at set → archive (unapplied_at) every live application of that payment.
--   - trigger on accounting.journal_entries: the JE dies (voided / reversed / not posted) → archive every live payment-less
--     application it sources. Both archive writes fire accounting.recompute_invoice_paid(), so the header follows.
--   - accounting.ar_aging_as_of(): credit memo applications count only while the application AND the credit memo are not
--     voided as of the date. Rest of the body identical to 202616400100.
--
-- PROD DATA (measured 2026-11-04, USMCA): 0 payment_applications, 0 credit_memo_applications live, 0 invoices with
-- amount_paid_cents <> 0; ar_aging_as_of(today) 62,107,672 = A/R 1100 GL 62,107,672 — nothing to repair.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, constraints guarded, CREATE OR REPLACE, DROP TRIGGER IF EXISTS + CREATE.

BEGIN;

ALTER TABLE accounting.payment_applications
  ADD COLUMN IF NOT EXISTS source_journal_entry_id uuid;

COMMENT ON COLUMN accounting.payment_applications.source_journal_entry_id IS
  'ACCT-F11103: for a payment-less application (payment_id NULL) the journal entry whose Cr ar_control is this relief. The application relieves the invoice only while that JE is live (accounting.journal_entry_live_as_of).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_applications_source_je_same_entity_fkey') THEN
    ALTER TABLE accounting.payment_applications
      ADD CONSTRAINT payment_applications_source_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, source_journal_entry_id)
      REFERENCES accounting.journal_entries (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_applications_payment_or_source_je_check') THEN
    ALTER TABLE accounting.payment_applications
      ADD CONSTRAINT payment_applications_payment_or_source_je_check
      CHECK (payment_id IS NOT NULL OR source_journal_entry_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payment_applications_source_je_idx
  ON accounting.payment_applications (source_journal_entry_id)
  WHERE source_journal_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION accounting.journal_entry_live_as_of(p_je_id uuid, p_as_of date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entries rv ON rv.id = je.reversed_by_je_id
     WHERE je.id = p_je_id
       AND je.status = 'posted'
       AND je.entry_date <= p_as_of
       AND (je.voided_at IS NULL OR (je.voided_at AT TIME ZONE 'UTC')::date > p_as_of)
       AND (je.reversed_by_je_id IS NULL OR rv.entry_date > p_as_of)
  );
$$;

COMMENT ON FUNCTION accounting.journal_entry_live_as_of(uuid, date) IS
  'ACCT-F11103: the JE is posted, dated on/before p_as_of, and neither voided nor reversed on/before p_as_of. infinity = live today.';

GRANT EXECUTE ON FUNCTION accounting.journal_entry_live_as_of(uuid, date) TO ih35_app;

CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(p_invoice_id uuid, p_as_of date)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(pa.amount_cents), 0)::bigint
    FROM accounting.invoices i
    JOIN accounting.payment_applications pa
      ON pa.invoice_id = i.id
     AND pa.operating_company_id = i.operating_company_id
    LEFT JOIN accounting.payments p
      ON p.id = pa.payment_id
     AND p.operating_company_id = pa.operating_company_id
   WHERE i.id = p_invoice_id
     -- dated by the payment's date when the application has a payment, by the application's own date when it has none
     AND COALESCE(p.payment_date, (pa.applied_at AT TIME ZONE 'UTC')::date) <= p_as_of
     -- an application unapplied on/before the date applies nothing
     AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > p_as_of)
     AND CASE
           -- payment-backed: the payment exists and is not voided on/before the date
           WHEN pa.payment_id IS NOT NULL
             THEN p.id IS NOT NULL AND (p.voided_at IS NULL OR (p.voided_at AT TIME ZONE 'UTC')::date > p_as_of)
           -- payment-less: only the live JE that credited A/R relieves the invoice — no source, no relief
           ELSE pa.source_journal_entry_id IS NOT NULL
                AND accounting.journal_entry_live_as_of(pa.source_journal_entry_id, p_as_of)
         END;
$$;

COMMENT ON FUNCTION accounting.invoice_applied_cents_as_of(uuid, date) IS
  'ACCT-F11103: cents applied to the invoice as of the date — applications of a payment not voided as of the date, and payment-less relief applications whose source journal entry (Cr ar_control) is live as of the date. Unapplied applications excluded. p_as_of = infinity gives the live total accounting.recompute_invoice_paid() writes to amount_paid_cents.';

GRANT EXECUTE ON FUNCTION accounting.invoice_applied_cents_as_of(uuid, date) TO ih35_app;

-- A voided payment applies nothing: archive its applications whoever wrote the void (the trigger recompute follows).
CREATE OR REPLACE FUNCTION accounting.tg_payment_void_unapplies_applications()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE accounting.payment_applications
     SET unapplied_at = NEW.voided_at,
         unapplied_by_user_id = COALESCE(unapplied_by_user_id, NEW.voided_by_user_id)
   WHERE payment_id = NEW.id
     AND operating_company_id = NEW.operating_company_id
     AND unapplied_at IS NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_void_unapplies_applications ON accounting.payments;
CREATE TRIGGER trg_payment_void_unapplies_applications
  AFTER UPDATE OF voided_at ON accounting.payments
  FOR EACH ROW
  WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION accounting.tg_payment_void_unapplies_applications();

-- A dead JE relieves nothing: archive the payment-less applications it sources (the trigger recompute follows).
CREATE OR REPLACE FUNCTION accounting.tg_journal_entry_death_unapplies_relief()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE accounting.payment_applications
     SET unapplied_at = COALESCE(NEW.voided_at, now())
   WHERE source_journal_entry_id = NEW.id
     AND operating_company_id = NEW.operating_company_id
     AND payment_id IS NULL
     AND unapplied_at IS NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_journal_entry_death_unapplies_relief ON accounting.journal_entries;
CREATE TRIGGER trg_journal_entry_death_unapplies_relief
  AFTER UPDATE OF status, reversed_by_je_id, voided_at ON accounting.journal_entries
  FOR EACH ROW
  WHEN ((OLD.status = 'posted' AND OLD.reversed_by_je_id IS NULL AND OLD.voided_at IS NULL)
        AND NOT (NEW.status = 'posted' AND NEW.reversed_by_je_id IS NULL AND NEW.voided_at IS NULL))
  EXECUTE FUNCTION accounting.tg_journal_entry_death_unapplies_relief();

-- accounting.ar_aging_as_of — body identical to 202616400100 except credited_as_of reads the credit memo's own void, as of
-- the date, beside the application's.
CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(p_opco uuid, p_as_of date)
RETURNS TABLE (
  customer_id          uuid,
  customer_name        text,
  open_invoice_count   bigint,
  current_cents        bigint,
  bucket_1_30_cents    bigint,
  bucket_31_60_cents   bigint,
  bucket_61_90_cents   bigint,
  bucket_91_plus_cents bigint,
  total_open_cents     bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH inv AS (
    SELECT
      i.id,
      i.customer_id,
      i.due_date,
      i.total_cents,
      -- ACCT-F11103: non-voided payments + payment-less relief backed by a live A/R-crediting JE (one rule).
      accounting.invoice_applied_cents_as_of(i.id, p_as_of) AS paid_as_of,
      -- ACCT-F5658 — dated credit-memo netting; ACCT-F11103 — only a credit memo not voided as of the date relieves A/R.
      COALESCE((
        SELECT SUM(cma.applied_cents)
        FROM accounting.credit_memo_applications cma
        JOIN accounting.credit_memos cm
          ON cm.id = cma.credit_memo_id
         AND cm.operating_company_id = cma.operating_company_id
        WHERE cma.invoice_id = i.id
          AND cma.operating_company_id = p_opco
          AND (cma.voided_at IS NULL OR (cma.voided_at AT TIME ZONE 'UTC')::date > p_as_of)
          AND (cm.voided_at IS NULL OR (cm.voided_at AT TIME ZONE 'UTC')::date > p_as_of)
          AND (cma.applied_at AT TIME ZONE 'UTC')::date <= p_as_of
      ), 0)::bigint AS credited_as_of
    FROM accounting.invoices i
    WHERE i.operating_company_id = p_opco
      AND i.issue_date <= p_as_of
      -- ACCT-F5658 — 'void' (ACCT-F171: the only real void spelling; 'voided' unreachable but kept
      -- to match every sibling surface) and 'proforma' (ACCT-F223: posts no JE) added to the
      -- original 'draft'/'factored' exclusions.
      AND i.status NOT IN ('draft', 'factored', 'void', 'voided', 'proforma')
      -- ACCT-F11099 — a recoursed invoice stays off trade A/R after a payment moves its status to partial / paid.
      AND NOT accounting.invoice_recoursed_off_trade_ar(i.id)
      AND (i.voided_at IS NULL OR i.voided_at::date > p_as_of)
  ),
  open_inv AS (
    SELECT
      inv.customer_id,
      inv.due_date,
      GREATEST(inv.total_cents - inv.paid_as_of - inv.credited_as_of, 0)::bigint AS open_cents
    FROM inv
    WHERE GREATEST(inv.total_cents - inv.paid_as_of - inv.credited_as_of, 0) > 0
  )
  SELECT
    oi.customer_id,
    COALESCE(c.customer_name, '')::text AS customer_name,
    COUNT(*)::bigint AS open_invoice_count,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date >= p_as_of), 0)::bigint AS current_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of AND oi.due_date >= p_as_of - 30), 0)::bigint AS bucket_1_30_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 30 AND oi.due_date >= p_as_of - 60), 0)::bigint AS bucket_31_60_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 60 AND oi.due_date >= p_as_of - 90), 0)::bigint AS bucket_61_90_cents,
    COALESCE(SUM(oi.open_cents) FILTER (WHERE oi.due_date < p_as_of - 90), 0)::bigint AS bucket_91_plus_cents,
    COALESCE(SUM(oi.open_cents), 0)::bigint AS total_open_cents
  FROM open_inv oi
  JOIN mdata.customers c ON c.id = oi.customer_id
  GROUP BY oi.customer_id, c.customer_name;
$$;

GRANT EXECUTE ON FUNCTION accounting.ar_aging_as_of(uuid, date) TO ih35_app;

COMMIT;
