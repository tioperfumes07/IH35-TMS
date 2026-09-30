-- 202615000000_bind_usmca_cash_gl_accounts.sql
-- ROUND 300 A-32 (Lead order): "CASH GL UNBOUND ON 3 OF 8 BANK ACCOUNTS -- measured live on
-- /banking right now. Bank Register and bank-feed posting need a Cash GL per account. Name the 3,
-- bind them, prove posting works on each. This blocks every bank-feed posting path."
--
-- MEASURED LIVE, 2026-09-30, br-fancy-credit-akjnd07a, USMCA (5c854333-6ea5-4faa-af31-67cb272fef80),
-- bypass_rls=lucia: of 8 active banking.bank_accounts rows, exactly 3 have ledger_account_id NULL:
--   Faro Cash Reserve     (id 58a1ca45-0d6a-42d2-b3bf-d8852e2fa823)
--   Faro Escrow Reserve   (id d5104d03-4646-4906-9fa7-0b595a1d74cc)
--   Petty Cash            (id 1b9760dd-e7f1-452c-8b61-1d8f11269dd8, is_petty_cash=true)
--
-- NAMED, NOT GUESSED, PER ACCOUNT:
--   1. Faro Cash Reserve -> catalogs.accounts 1235 "Faro Cash Reserve" (id
--      ddcb9350-bbe3-425d-b15d-99c75351b567) ALREADY EXISTS, Asset/Other Current Assets -- an exact
--      name match, simply never bound. No new account created for this one.
--   2. Faro Escrow Reserve -> NO existing GL account matches (verified: no
--      catalogs.accounts row named "%Escrow Reserve%" or "%Faro%Escrow%" exists for USMCA -- the
--      only escrow-named accounts are the per-driver 2100-00-* LIABILITY trust accounts, which are
--      the wrong side of the ledger for a bank account holding actual cash). Creates 1236 "Faro
--      Escrow Reserve", Asset/Other Current Assets, adjacent to 1235 by design (same Faro-cash-
--      reserve family). Authorized under the owner's standing USMCA-create-missing-accounts ruling.
--   3. Petty Cash -> NO existing GL account matches (verified: no catalogs.accounts row named
--      "%Petty%Cash%" exists for USMCA -- this is genuinely the first petty-cash GL account in this
--      entity's chart). Creates 1005 "Petty Cash", Asset/CashOnHand (the same subtype spelling
--      already used elsewhere: catalogs.accounts.account_subtype='CashOnHand' exists company-wide),
--      slotted right after 1000 "Bank of America - Operating (USMCA)" in the numbering. Authorized
--      under the same standing ruling.
--
-- WHY THIS IS THE RIGHT FIX, NOT A WORKAROUND: this is a data-binding gap (2 real GL accounts
-- created, 3 bank accounts pointed at the right GL account each), not a code fix -- the actual
-- posting code path (bank-feed posting, Bank Register) already reads bank_accounts.ledger_account_id
-- and was correctly refusing/skipping these 3 accounts because that column was genuinely NULL.
--
-- ADDITIVE + IDEMPOTENT. No existing account renamed/reclassified/merged/deactivated (Rule 19 --
-- reserve accounts are owner-manual only for those operations; this migration only CREATES two new
-- ones and BINDS three existing bank_accounts rows, touching no reserve account's own identity).
-- The UPDATEs are guarded by `AND ledger_account_id IS NULL` so a re-run, or a manual bind that
-- lands between authoring and merge, is never silently overwritten.

BEGIN;

-- 1. Faro Escrow Reserve -- new GL account, 1236, adjacent to 1235 Faro Cash Reserve.
INSERT INTO catalogs.accounts (
  id, operating_company_id, account_number, account_name, account_type, account_subtype
)
SELECT gen_random_uuid(), '5c854333-6ea5-4faa-af31-67cb272fef80', '1236', 'Faro Escrow Reserve', 'Asset', 'Other Current Assets'
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs.accounts
  WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND account_number = '1236'
);

-- 2. Petty Cash -- new GL account, 1005.
INSERT INTO catalogs.accounts (
  id, operating_company_id, account_number, account_name, account_type, account_subtype
)
SELECT gen_random_uuid(), '5c854333-6ea5-4faa-af31-67cb272fef80', '1005', 'Petty Cash', 'Asset', 'CashOnHand'
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs.accounts
  WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND account_number = '1005'
);

-- 3. Bind the 3 bank accounts to their Cash GL account.
UPDATE banking.bank_accounts
SET ledger_account_id = 'ddcb9350-bbe3-425d-b15d-99c75351b567' -- existing 1235 Faro Cash Reserve
WHERE id = '58a1ca45-0d6a-42d2-b3bf-d8852e2fa823' AND ledger_account_id IS NULL;

UPDATE banking.bank_accounts
SET ledger_account_id = (
  SELECT id FROM catalogs.accounts
  WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND account_number = '1236'
)
WHERE id = 'd5104d03-4646-4906-9fa7-0b595a1d74cc' AND ledger_account_id IS NULL;

UPDATE banking.bank_accounts
SET ledger_account_id = (
  SELECT id FROM catalogs.accounts
  WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND account_number = '1005'
)
WHERE id = '1b9760dd-e7f1-452c-8b61-1d8f11269dd8' AND ledger_account_id IS NULL;

COMMIT;
