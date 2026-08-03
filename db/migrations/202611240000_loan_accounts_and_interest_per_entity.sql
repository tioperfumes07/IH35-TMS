-- [FINANCIAL-CLUSTER] LOAN-03 — related-party loan accounts + interest accounts, per entity.
-- POSTS NOTHING. Additive: INSERT ... WHERE NOT EXISTS only. No UPDATE, no DELETE, no schema change.
-- Apply-twice safe.
--
-- CANONICAL-CHECK: n/a — this migration creates no table. It adds ROWS to catalogs.accounts, which is
-- and remains the single canonical chart of accounts. No new ledger, no new money concept.
--
-- ROOT CAUSE, MEASURED ON PROD 2026-08-03 (current_user asserted in-statement, per-entity counts):
--   entity   interest_income  interest_receivable  owner_loan_accounts
--   TRANSP         0                  0                   2
--   TRK            1                  0                   0
--   USMCA          0                  0                   0
-- The build spec (V6) requires interest on a loan OUT to post DR Interest Receivable / CR Interest
-- Income. NEITHER account exists on TRANSP, and USMCA has no loan accounts at all. Without these the
-- poster would resolve nothing and refuse — correctly, but permanently. The spec assumed only USMCA was
-- short; the live read shows TRANSP is missing both interest accounts too, so this covers both.
--
-- WHY THESE NUMBERS: USMCA's chart is the clean 4-digit scheme (4000 income, 2000 liability, 1x00
-- assets), so the new rows follow it — 7100 Interest Income sits above the 4xxx operating-income block
-- as non-operating income, 1260 Interest Receivable joins the other current receivables (1250 is Driver
-- Fuel-Overage Receivable), 2410 Owner/Related-Party Loan Payable sits beside 2400 Equipment Loans.
-- TRANSP's chart is QBO-mirrored with no free 4-digit block in use for these, so its two interest
-- accounts take the same 7100/1260 numbers — they do not collide (verified: TRANSP has neither).
-- TRK is left alone: it already has an interest-income account and does not lend to related parties.
--
-- NO ROLE BINDING HERE. Creating an account and DESIGNATING it for a posting role are different acts;
-- role designation is owner-controlled (Rule 19 territory) and a poster that resolves an unbound role
-- fails closed by design. These rows make the designation POSSIBLE; they do not make it silently.

BEGIN;

DO $$
DECLARE
  v_created bigint := 0;
  v_rows    bigint;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL THEN
    RAISE EXCEPTION 'catalogs.accounts missing — refusing to seed blind';
  END IF;

  -- ── USMCA: related-party loan liability (direction 'in') ────────────────────────────────────────
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT c.id, '2410', 'Owner / Related-Party Loan Payable', 'Liability', 'OtherCurrentLiability', true
  FROM org.companies c
  WHERE c.code = 'USMCA'
    AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='2410');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_created := v_created + v_rows;

  -- ── USMCA: related-party loan receivable parent (direction 'out') ───────────────────────────────
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT c.id, '1270', 'Loans to Related Parties', 'Asset', 'OtherCurrentAsset', true
  FROM org.companies c
  WHERE c.code = 'USMCA'
    AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='1270');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_created := v_created + v_rows;

  -- ── Interest accounts — BOTH TRANSP and USMCA (TRANSP verified missing both) ────────────────────
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT c.id, '7100', 'Interest Income', 'Income', 'OtherPrimaryIncome', true
  FROM org.companies c
  WHERE c.code IN ('TRANSP','USMCA')
    AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='7100');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_created := v_created + v_rows;

  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT c.id, '1260', 'Interest Receivable', 'Asset', 'OtherCurrentAsset', true
  FROM org.companies c
  WHERE c.code IN ('TRANSP','USMCA')
    AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='1260');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_created := v_created + v_rows;

  RAISE NOTICE 'LOAN-03: created % account row(s)', v_created;

  -- Fail closed: every entity that must be able to post related-party interest now can.
  IF EXISTS (
    SELECT 1 FROM org.companies c
    WHERE c.code IN ('TRANSP','USMCA')
      AND (NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='7100')
        OR NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=c.id AND a.account_number='1260'))
  ) THEN
    RAISE EXCEPTION 'LOAN-03: an entity still lacks 7100 Interest Income or 1260 Interest Receivable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a JOIN org.companies c ON c.id=a.operating_company_id
    WHERE c.code='USMCA' AND a.account_number='2410'
  ) THEN
    RAISE EXCEPTION 'LOAN-03: USMCA still lacks 2410 Owner / Related-Party Loan Payable';
  END IF;
END $$;

COMMIT;
