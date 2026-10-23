-- 202616190700_expense_card_credit.sql
-- CC-2 · LEAD 443.258.5 ruling 2 (writer shape B). A fuel-card statement's DISCOUNT is a credit on the card account
-- (2510 Dreamline card payable, account_subtype CreditCard). In QuickBooks that is a "Credit Card Credit" — a Purchase
-- with Credit=true — never a VendorCredit (A/P only). This makes it a document of THE expense writer instead of the
-- handwritten journal entry postStatementDifference used to insert (sourced to another document, the receipt):
--   accounting.expenses.is_credit = true  ->  the expense posting engine posts the SAME lines with the sides flipped:
--   Dr payment account (2510) / Cr category account (5000 via the Fuel Card Discount item).
-- Every existing row is is_credit = false (money out), unchanged. Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN accounting.expenses.is_credit IS 'LEAD 443.258.5: a card CREDIT (QBO Purchase Credit=true) — the posting engine flips the sides: Dr payment account / Cr category. false = money out (every expense before 443.258.5).';
COMMIT;
