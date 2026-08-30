-- FULL ACCOUNTABILITY (owner 2026-08-30, after 202608301800).
-- Cursor ledger number 202613301600 (HH=16; 202608302340 was below 20261330 tail).
-- Closes the causes the owner named that had no home:
--   "or if we invoiced incorrectly"  -> 4955
--   "a penalization"                 -> 4980
--   agreed / quick-pay concession    -> 4970  (no-fault, must not pollute fault KPIs)
--   "their fault, we intend to chase" -> 1240 (an ASSET, not a same-day write-off)
-- Resolve companies BY CODE. Idempotent. WORM: add and deactivate, never DELETE.

BEGIN;

DO $$
DECLARE
  v_usmca  uuid;
  v_parent uuid;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'shortpay accountability: USMCA missing - skip';
    RETURN;
  END IF;

  SELECT id INTO v_parent FROM catalogs.accounts
   WHERE operating_company_id = v_usmca AND account_number = '4900' AND deactivated_at IS NULL LIMIT 1;
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'shortpay accountability: 4900 parent missing - run 202608301800 first';
  END IF;

  -- 4955 CARRIER FAULT, BILLING. The owner's "if we invoiced incorrectly".
  -- Deliberately NOT folded into 4910: a rating/mileage/accessorial mistake is a billing
  -- failure, not a service failure, and it is a different department's number.
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id)
  SELECT v_usmca, '4955', 'Short-Pay — Our Billing Error', 'Income', 'Discounts/Refunds Given',
         'shortpay_billing_error', true, v_parent
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4955' AND a.deactivated_at IS NULL);

  -- 4970 NEUTRAL. Agreed concession / contractual quick-pay discount.
  -- Segregated so no-fault money can never inflate a fault KPI.
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id)
  SELECT v_usmca, '4970', 'Short-Pay — Agreed Concession / Quick-Pay Discount', 'Income', 'Discounts/Refunds Given',
         'shortpay_agreed_concession', true, v_parent
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4970' AND a.deactivated_at IS NULL);

  -- 4980 The owner's "a penalization". A punitive fee the broker levies (late tracking,
  -- missed check calls, no ELD visibility, fuel-advance fee) is NOT a price adjustment for
  -- service quality, and penalties are disputed far more often than netted deductions.
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id)
  SELECT v_usmca, '4980', 'Short-Pay — Penalty / Fine Assessed by Customer', 'Income', 'Discounts/Refunds Given',
         'shortpay_penalty', true, v_parent
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4980' AND a.deactivated_at IS NULL);

  -- 1240 CUSTOMER FAULT AND RECOVERABLE. An ASSET, not contra-revenue.
  -- Without this, a deduction we intend to chase is written off the day it appears and
  -- nobody ever chases it. Its aging balance is the collections work queue.
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable)
  SELECT v_usmca, '1240', 'Freight Claims Receivable — Disputed Deductions', 'Asset', 'OtherCurrentAsset',
         'disputed_deduction_receivable', true
  WHERE NOT EXISTS (SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '1240' AND a.deactivated_at IS NULL);

  -- Reason CHECK: WORM-extend for the newly-homed causes. Keep every prior value.
  IF to_regclass('accounting.credit_memos') IS NOT NULL THEN
    ALTER TABLE accounting.credit_memos DROP CONSTRAINT IF EXISTS credit_memos_reason_check;
    ALTER TABLE accounting.credit_memos ADD CONSTRAINT credit_memos_reason_check CHECK (
      reason IN (
        'damage','shortage','rate_dispute','duplicate_billing','detention_dispute',
        'late_delivery','missing_paperwork','lumper_receipt_missing','detention_denied',
        'factoring_dilution','unknown_pending_backup',
        'billing_error_ours','penalty_assessed','agreed_concession','quick_pay_discount',
        'unauthorized_deduction','unearned_discount','rate_underpaid',
        'other'
      )
    );
  END IF;
END $$;

COMMIT;
