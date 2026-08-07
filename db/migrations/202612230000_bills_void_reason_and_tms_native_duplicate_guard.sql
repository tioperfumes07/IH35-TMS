-- ACCT-F142 — the TMS can enter the same vendor bill twice, and cannot say why a bill was voided.
--
-- FOUND BY: the owner-directed live transaction battery on USMCA, 2026-08-06 — the Bills list showed
-- three identical `TEST-BILL-0806-A` rows. They are three DISTINCT accounting.bills rows, same vendor,
-- same number, same date, same $450, created 15s and 25s apart (06:01:57 / 06:02:12 / 06:02:38 UTC).
-- Not a display bug.
--
-- IT IS STILL HAPPENING. While this migration was being written, a SECOND duplicate group appeared on
-- prod from another lane's battery run: CC3-BILL-20260806-01, $743.21, twice, created ELEVEN SECONDS
-- apart (16:41:28.897 / 16:41:39.161 UTC). Live prod totals at that moment:
--     TMS-native live bills ......... 10
--     of those, duplicates ...........  5  (a 3-copy group and a 2-copy group)
--     overstated A/P ................. $1,643.21
-- Half of every bill this system has ever created on its own is a duplicate, and the gap between
-- copies — 11s, 15s, 25s — is the signature of a re-submitted create, not of a human re-keying an
-- invoice. The missing constraint below is the reason a double-submit lands twice instead of erroring.
--
-- ROOT CAUSE — the duplicate protection exists exactly where it is not needed and is absent exactly
-- where the TMS creates bills itself. Verified on prod (pg_index, RLS-bypassed in-transaction), the
-- ONLY uniqueness on accounting.bills is:
--     bills_pkey                            (id)
--     uq_bills_company_qbo_bill_id          ... WHERE qbo_bill_id IS NOT NULL
--     uq_bills_company_qbo_idempotency_key  ... WHERE qbo_idempotency_key IS NOT NULL
-- Both real ones are PARTIAL on a QBO column. A bill the TMS creates has qbo_bill_id IS NULL, so
-- neither index applies to it. The 16,245 QBO-cloned bills — already deduplicated upstream by QBO's
-- own ids, the population that needs it least — are protected. The TMS-native bills are not.
--
-- This is the standard every reference package enforces (QBO refuses a repeated bill no. per vendor;
-- NetSuite/McLeod the same) because a re-keyed vendor invoice is the most common A/P overstatement
-- there is, and it pays the vendor twice.
--
-- SECOND DEFECT, same table, found while writing the remediation below: accounting.bills has ONLY
-- `voided_at` — no void_reason, no voided_by. A bill can be voided with nothing recording WHY or by
-- WHOM. PERMANENT LAW B requires voided_at / void_reason / voided_by on record-level financial
-- tables; an unexplained void is the same evidentiary hole as a delete, one step removed. The
-- columns must exist BEFORE the remediation, or the remediation itself would be an unexplained void.
--
-- SCOPE — TMS-NATIVE ONLY, and that is load-bearing, not caution. The QBO mirror is the one set of
-- REAL financial data in the system (PERMANENT LAW §2). Imported history legitimately contains
-- repeated vendor invoice numbers, and a constraint over it would either fail to install or, if
-- someone "fixed" the data to make it install, would void real QuickBooks history. Guard the records
-- the TMS produces going forward; leave the import alone.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / IF NOT EXISTS on index + constraint / to_regclass.

DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NULL THEN
    RAISE NOTICE 'ACCT-F142: accounting.bills absent — skipping';
    RETURN;
  END IF;

  -- §1 — a void must name a reason and an actor. Inline REFERENCES on purpose: an unresolvable
  -- voider is the same evidentiary gap as an unexplained void (verify-orphan-fk-inventory).
  ALTER TABLE accounting.bills
    ADD COLUMN IF NOT EXISTS void_reason       text,
    ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.bills'::regclass
       AND conname  = 'bills_void_reason_required'
  ) THEN
    -- NOT VALID: binds new writes without re-validating 16,245 rows of imported history, which
    -- predate the column and can never satisfy it retroactively.
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_void_reason_required
      CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, '')) <> '') NOT VALID;
  END IF;
END
$$;

-- §2 — REMEDIATION. The unique index cannot install over live duplicates, so the existing ones are
-- VOIDED — never deleted (WORM). Deterministic and auditable: within each exact-duplicate group the
-- EARLIEST row by created_at survives and every later one is voided, so the surviving bill is the
-- one any payment or GL activity would already have been keyed to.
--
-- This mutates money rows, and it is written out in full rather than hidden: on prod it affects 2
-- rows, both USMCA, both TMS-native — which PERMANENT LAW §2 defines as TEST data. On a fresh CI
-- database it affects zero rows and is a no-op. It is deliberately NOT a blanket dedupe: it fires
-- only on groups that are identical in entity, vendor, bill number AND amount, because two genuinely
-- different bills that merely share a number are a data question for a human, not for a migration.
DO $$
DECLARE
  n int := 0;
BEGIN
  IF to_regclass('accounting.bills') IS NULL THEN RETURN; END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY operating_company_id, mdata_vendor_id, bill_number, total_amount
             ORDER BY created_at, id
           ) AS rn
      FROM accounting.bills
     WHERE qbo_bill_id     IS NULL      -- TMS-native only; never the QBO mirror
       AND voided_at       IS NULL
       AND bill_number     IS NOT NULL
       AND mdata_vendor_id IS NOT NULL
  )
  UPDATE accounting.bills b
     SET voided_at   = now(),
         void_reason = 'ACCT-F142: duplicate vendor bill — same entity, vendor, bill number and '
                       || 'amount as an earlier row. Voided (not deleted) so the partial unique '
                       || 'index below can install. Earliest row retained.'
    FROM ranked r
   WHERE b.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'ACCT-F142: voided % duplicate TMS-native bill(s)', n;
END
$$;

-- §3 — the enforcement. A DB constraint, not a CI grep: this has to hold against every write path,
-- including ones not written yet. Partial so it binds ONLY TMS-native, non-voided, fully-identified
-- bills — voiding a duplicate remains a legal way to correct one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_tms_native_vendor_bill_number
  ON accounting.bills (operating_company_id, mdata_vendor_id, bill_number)
  WHERE qbo_bill_id     IS NULL
    AND voided_at       IS NULL
    AND bill_number     IS NOT NULL
    AND mdata_vendor_id IS NOT NULL;

-- §4 — the same structural gap, one table over. Surveyed every money document table on prod
-- (pg_index, RLS-bypassed): invoices, payments, vendor_credits and factoring_advances each carry an
-- UNCONDITIONAL UNIQUE (operating_company_id, display_id), and expenses carries
-- (operating_company_id, expense_number). The A/P pair are the only two whose sole duplicate
-- protection is conditional on a QBO id — accounting.bills (§3) and accounting.bill_payments, whose
-- entire uniqueness is bills_pkey plus two partial indexes gated on qbo_bill_payment_id /
-- qbo_idempotency_key IS NOT NULL. So the class is exactly the two A/P tables, and this closes it.
--
-- No live duplicate here to remediate: bill_payments holds 6,543 QBO clones and exactly ONE
-- TMS-native row, so the gap is structural, not yet realised. A duplicated bill payment is strictly
-- worse than a duplicated bill — it pays the vendor twice — which is why it is closed now rather
-- than after it happens.
--
-- Keyed on CHECK NUMBER, deliberately, and not on (bill, date, amount): reusing a check number on
-- the same bank account is unambiguously wrong and is exactly what QBO and McLeod block, whereas two
-- partial payments of the same amount against the same bill on the same day are unusual but LEGAL,
-- and a constraint that forbids them would be this migration inventing an accounting rule. The
-- double-submit path that produced the §2 duplicates is an application-level idempotency fix and is
-- called out in REMAINING rather than approximated with a lossy index here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_tms_native_check_number
  ON accounting.bill_payments (operating_company_id, from_bank_account_id, check_number)
  WHERE qbo_bill_payment_id IS NULL
    AND revoked_at          IS NULL
    AND check_number        IS NOT NULL
    AND from_bank_account_id IS NOT NULL;
