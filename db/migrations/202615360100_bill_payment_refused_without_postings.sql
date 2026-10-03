-- 202615360100_bill_payment_refused_without_postings.sql
-- CC-1 · ROUND 363-CC1-B (second half) · LAW 363.6 / ROUND 369.6 — a bill payment posts WHEN IT IS CREATED, in the same
-- transaction. The database now refuses a bill payment that COMMITS without its postings, so no writer — present,
-- future, or written by a seat who never read this — can leave one behind.
--
-- Why: 130 bill payments ($63,890.88) carried zero postings, written 2026-09-28 by an ops adoption script (#22918), and
-- three app writers posted AFTER their insert had committed and logged a failure. The writers were fixed first
-- (#24661, ACCT-F9862 — every inserter now posts on its own transaction); this refusal is armed after them, per the
-- Lead's order "writers, then backfill, then arm".
--
-- The rule, evaluated at COMMIT (CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED — the same shape as
-- trg_live_posting_keeps_spine_link, for the same reason: the payment row is inserted before its postings, in one
-- transaction): a newly inserted accounting.bill_payments row that is still live at commit must have at least one
-- accounting.journal_entry_postings row with source_transaction_type = 'bill_payment' and its id. Exempt, each
-- exactly the poster's own refusal set (posting-engine buildBillPaymentLines):
--   * settlement_deduction_noncash — its GL is owned by the settlement deduction JE (never posted as a payment);
--   * a QBO-origin bill or a QBO-mirrored payment — parallel books, QBO holds that A/P settlement;
--   * is_sample_data, voided / revoked / status 'void' by commit;
--   * a company where BILL_PAYMENT_GL_POSTING_ENABLED resolves OFF (the documented per-entity kill switch).
-- INSERT only: the 130 historical rows (closed August/September periods, purge population) are not touched by the rule.
-- Idempotent.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION accounting.refuse_bill_payment_without_postings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bp record;
  flag_on boolean;
BEGIN
  SELECT p.id, p.operating_company_id, p.bill_id, p.voided_at, p.revoked_at, p.status, p.is_sample_data,
         p.settlement_deduction_noncash, p.qbo_bill_payment_id, b.source_system AS bill_source_system
    INTO bp
    FROM accounting.bill_payments p
    LEFT JOIN accounting.bills b ON b.id = p.bill_id
   WHERE p.id = NEW.id;

  -- Deleted in the same transaction, voided, sample, non-cash, or QBO: nothing to post.
  IF NOT FOUND
     OR bp.voided_at IS NOT NULL OR bp.revoked_at IS NOT NULL OR COALESCE(bp.status, '') = 'void'
     OR COALESCE(bp.is_sample_data, false)
     OR COALESCE(bp.settlement_deduction_noncash, false)
     OR bp.qbo_bill_payment_id IS NOT NULL
     OR lower(COALESCE(bp.bill_source_system, '')) = 'qbo' THEN
    RETURN NULL;
  END IF;

  -- The per-entity kill switch, resolved as lib/feature-flags does for a company: a company override wins, else the
  -- registered default.
  SELECT COALESCE(
           (SELECT o.enabled FROM lib.feature_flag_overrides o
             WHERE o.flag_key = 'BILL_PAYMENT_GL_POSTING_ENABLED' AND o.operating_company_id = bp.operating_company_id
               AND o.user_uuid IS NULL AND (o.expires_at IS NULL OR o.expires_at > now())
             ORDER BY o.set_at DESC LIMIT 1),
           (SELECT f.default_enabled FROM lib.feature_flags f WHERE f.flag_key = 'BILL_PAYMENT_GL_POSTING_ENABLED'),
           false)
    INTO flag_on;
  IF NOT flag_on THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings j
                  WHERE j.source_transaction_type = 'bill_payment' AND j.source_transaction_id = bp.id::text) THEN
    RAISE EXCEPTION 'bill payment % committed with no postings — a bill payment posts on the transaction that creates it (Dr the bill''s payable / Cr the bank or card). Post it with postBillPaymentGlIfEnabledInClientTx on the creating client.', bp.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_bill_payment_requires_postings ON accounting.bill_payments;
CREATE CONSTRAINT TRIGGER trg_bill_payment_requires_postings
  AFTER INSERT ON accounting.bill_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_bill_payment_without_postings();

COMMENT ON FUNCTION accounting.refuse_bill_payment_without_postings() IS
  'ROUND 363-CC1-B: at COMMIT, a newly inserted live cash bill payment must carry its bill_payment postings '
  '(exempt: non-cash settlement deduction, QBO-origin, sample, voided, or flag OFF for the company).';

COMMIT;
