-- FARO REPURCHASE OBLIGATION TRACKER (owner 2026-08-30: "have the system track it").
-- Source: the EXECUTED Faro Factoring agreement (Faro Factoring LLC & IH 35 Transportation LLC),
-- text embedded in ~/Desktop/CPA ANSWERS.docx. Terms taken verbatim:
--   Security Reserve        1.5% of Net Amount of each Purchased Account
--   Purchase Price          Net Amount - (Factoring Fee + Security Reserve)
--   Purchase Price Proceeds Purchase Price - Transaction Fees
--   Repurchase Price        Net Amount + unpaid Transaction Fees + Default Interest - credits
--   Repurchase Term         30 calendar days
--   Grace Period            5 calendar days      (=> Default Interest starts day 35)
--   Default Interest Rate   0.067% per day, compounded daily
--   Repurchase Deadline     95 calendar days from the Purchase Date
-- NOTE: the agreement's own illustrative example computes with 0.066%. The OPERATIVE term-sheet
-- rate is 0.067% and that is what poster.service.ts already uses. Do NOT "correct" it to 0.066.
-- Idempotent. WORM: add and deactivate, never DELETE.

BEGIN;

-- 1) Carry the contract's three distinct clocks instead of one generic recourse_days.
ALTER TABLE factoring.factor ADD COLUMN IF NOT EXISTS repurchase_term_days      integer;
ALTER TABLE factoring.factor ADD COLUMN IF NOT EXISTS grace_period_days         integer;
ALTER TABLE factoring.factor ADD COLUMN IF NOT EXISTS repurchase_deadline_days  integer;
ALTER TABLE factoring.factor ADD COLUMN IF NOT EXISTS default_interest_daily_rate numeric(9,7);

COMMENT ON COLUMN factoring.factor.repurchase_term_days IS
  'Executed Faro agreement: Repurchase Term, 30 calendar days from Purchase Date.';
COMMENT ON COLUMN factoring.factor.grace_period_days IS
  'Executed Faro agreement: Grace Period, 5 calendar days. Default Interest begins after term+grace.';
COMMENT ON COLUMN factoring.factor.repurchase_deadline_days IS
  'Executed Faro agreement: Repurchase Deadline, 95 calendar days from Purchase Date. Hard backstop.';
COMMENT ON COLUMN factoring.factor.default_interest_daily_rate IS
  'Executed Faro agreement term sheet: 0.067%/day compounded. The example in the same document uses '
  '0.066% and is illustrative only. Operative rate is 0.00067.';

UPDATE factoring.factor
   SET repurchase_term_days       = COALESCE(repurchase_term_days, 30),
       grace_period_days          = COALESCE(grace_period_days, 5),
       repurchase_deadline_days   = COALESCE(repurchase_deadline_days, 95),
       default_interest_daily_rate= COALESCE(default_interest_daily_rate, 0.0006700)
 WHERE voided_at IS NULL
   AND name ILIKE '%faro%';

-- 2) Purchase Date + derived Repurchase Deadline on every Purchased Account.
ALTER TABLE accounting.factoring_advances ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE accounting.factoring_advances ADD COLUMN IF NOT EXISTS repurchase_deadline_date date;

COMMENT ON COLUMN accounting.factoring_advances.purchase_date IS
  'Executed Faro agreement: Purchase Date. Backfilled from advanced_at; all contract clocks run from here.';
COMMENT ON COLUMN accounting.factoring_advances.repurchase_deadline_date IS
  'Purchase Date + repurchase_deadline_days (95). The date Seller MUST have caused the account to '
  'become a Repurchased Account. This is where the money actually leaves.';

UPDATE accounting.factoring_advances
   SET purchase_date = COALESCE(purchase_date, (advanced_at AT TIME ZONE 'UTC')::date)
 WHERE purchase_date IS NULL AND advanced_at IS NOT NULL;

UPDATE accounting.factoring_advances a
   SET repurchase_deadline_date = a.purchase_date + COALESCE(f.repurchase_deadline_days, 95)
  FROM factoring.factor f
 WHERE f.operating_company_id = a.operating_company_id
   AND f.voided_at IS NULL AND f.active IS TRUE
   AND a.purchase_date IS NOT NULL
   AND a.repurchase_deadline_date IS DISTINCT FROM a.purchase_date + COALESCE(f.repurchase_deadline_days, 95);

-- 3) Transaction Fees are far broader than the wire fee. The agreement charges Seller for
--    "wire fees, charges for insufficient funds, credit card fees, UCC filing fees, UCC search
--     fees, costs of collection, attorneys fees, postage, court costs, etc."
--    Each one raises the Repurchase Price. Today only a wire-fee role exists.
CREATE TABLE IF NOT EXISTS accounting.factoring_transaction_fees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  factoring_advance_id  uuid NOT NULL REFERENCES accounting.factoring_advances(id),
  fee_type              text NOT NULL CHECK (fee_type IN (
                          'wire','nsf','credit_card','ucc_filing','ucc_search',
                          'collection_costs','attorney_fees','postage','court_costs','other')),
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  incurred_on           date NOT NULL,
  paid_or_deducted_on   date,
  source_document_ref   text,
  journal_entry_id      uuid REFERENCES accounting.journal_entries(id),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  voided_at             timestamptz,
  voided_by_user_id     uuid REFERENCES identity.users(id),
  void_reason           text
);
CREATE INDEX IF NOT EXISTS ix_factoring_txn_fees_advance
  ON accounting.factoring_transaction_fees (factoring_advance_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_factoring_txn_fees_company
  ON accounting.factoring_transaction_fees (operating_company_id, incurred_on);

ALTER TABLE accounting.factoring_transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_transaction_fees FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE accounting.factoring_transaction_fees IS
  'Executed Faro agreement: Transaction Fees. Every unpaid row raises the Repurchase Price. '
  'WORM - void, never delete.';

COMMIT;
