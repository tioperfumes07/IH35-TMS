-- 202615350600_bank_feed_bucket_and_kind.sql
-- ROUND 360 (CC-2) — the bank feed state machine. Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
--
-- SPLIT THE COLUMN.
--   review_bucket    for_review | categorized | excluded     WHERE the line sits — exactly the three tabs
--   resolution_kind  added | matched | transfer | split | NULL  HOW it got there — the Action column
--
-- Measured 2026-10-03 (all companies, live lines): two state columns that disagree. review_state (CHECK
-- for_review/categorized/excluded/matched/transfer) is written by match, the GL poster and one exclude path; a free-text
-- status is written by categorize, transfer, skip and undo; nothing ever wrote review_state 'categorized' or 'transfer'.
-- BANK-UNDO-01 cleared the links but never review_state, stranding 29 USMCA lines in 'matched' with no document; the main
-- page's Exclude writes status 'skipped', which no tab reads.
--
-- THE BUCKET CANNOT LIE BECAUSE IT IS NOT TYPED BY HAND. banking.bank_line_classify() (BEFORE INSERT OR UPDATE) derives
-- review_bucket and resolution_kind from the line's own evidence every time the row is written:
--   a live document link (any matched_*_id, matched_journal_entry_id, linked_entity_id, or a split)  -> categorized
--     kind: transfer (matched_transfer_id / transfer_kind) | split (status 'split') |
--           added (the bank feed categorized it — categorization account set or status 'categorized') | matched (else)
--   no link, excluded (excluded_reason / skip_reason / status 'skipped' / a writer setting review_state 'excluded') -> excluded
--   otherwise                                                                                            -> for_review
-- A writer may DECLARE the kind (SET resolution_kind = 'matched' on a match, 'added' on a categorize); the classifier
-- keeps a declared kind, keeps an existing kind across unrelated writes, and derives one only when nobody said.
-- So an undo that clears the links lands in For review by construction, and a writer that forgets the bucket cannot strand
-- a row: there is no fourth place to put it. review_state is kept as a compatibility echo (categorized -> 'matched', as
-- every existing reader understands it) until the readers move to review_bucket; tabs read review_bucket only.
-- CHECKs (NOT VALID — bind every new write; existing non-frozen rows are proven by the post-conditions at the end):
--   categorized => resolution_kind NOT NULL AND a live document link; for_review / excluded => resolution_kind NULL AND
--   no document link (chk_bank_line_bucket_matches_link: the bucket is categorized exactly when a link exists).

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS review_bucket text,
  ADD COLUMN IF NOT EXISTS resolution_kind text;

CREATE OR REPLACE FUNCTION banking.bank_line_classify() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_linked boolean;
  v_excluded boolean;
  v_kind text;
BEGIN
  v_linked := num_nonnulls(
                NEW.matched_advance_id, NEW.matched_bill_id, NEW.matched_bill_payment_id, NEW.matched_expense_id,
                NEW.matched_factoring_advance_id, NEW.matched_fuel_transaction_id, NEW.matched_invoice_id,
                NEW.matched_journal_entry_id, NEW.matched_load_id, NEW.matched_payment_id,
                NEW.matched_relay_fuel_transaction_id, NEW.matched_settlement_id, NEW.matched_transfer_id,
                NEW.linked_entity_id) > 0
              OR NEW.status IN ('split', 'transfer')
              OR NEW.transfer_kind IS NOT NULL;
  -- review_state is an OUTPUT of this function, so as an INPUT it counts only when the writer sets it in this statement
  -- (or on the one-time backfill, OLD.review_bucket IS NULL); its evidence is then kept in excluded_reason, so Undo of an
  -- exclude is "clear the reason" for every exclude path alike.
  v_excluded := NEW.excluded_reason IS NOT NULL OR NEW.skip_reason IS NOT NULL OR NEW.status = 'skipped'
                OR (NEW.review_state = 'excluded'
                    AND (TG_OP = 'INSERT' OR OLD.review_state IS DISTINCT FROM 'excluded' OR OLD.review_bucket IS NULL));
  IF v_excluded AND NEW.excluded_reason IS NULL AND NEW.skip_reason IS NULL AND NEW.status IS DISTINCT FROM 'skipped' THEN
    NEW.excluded_reason := 'excluded';
  END IF;

  IF v_linked THEN
    IF TG_OP = 'UPDATE' AND NEW.resolution_kind IS NOT NULL AND NEW.resolution_kind IS DISTINCT FROM OLD.resolution_kind THEN
      v_kind := NEW.resolution_kind;          -- the writer DECLARED how it got here (match -> matched, categorize -> added)
    ELSIF TG_OP = 'UPDATE' AND OLD.review_bucket = 'categorized' AND OLD.resolution_kind IS NOT NULL THEN
      v_kind := OLD.resolution_kind;          -- still linked: an unrelated write never re-labels the line
    ELSE
      v_kind := CASE
        WHEN NEW.matched_transfer_id IS NOT NULL OR NEW.transfer_kind IS NOT NULL OR NEW.status = 'transfer' THEN 'transfer'
        WHEN NEW.status = 'split' THEN 'split'
        WHEN NEW.status = 'categorized' OR NEW.categorization_gl_account_id IS NOT NULL OR NEW.coa_account_id IS NOT NULL THEN 'added'
        ELSE 'matched'
      END;
    END IF;
    NEW.review_bucket := 'categorized';
    NEW.resolution_kind := v_kind;
    NEW.review_state := 'matched';            -- compatibility echo: every existing reader treats 'matched' as resolved
  ELSIF v_excluded THEN
    NEW.review_bucket := 'excluded';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'excluded';
  ELSE
    NEW.review_bucket := 'for_review';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'for_review';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_bank_line_classify ON banking.bank_transactions;
CREATE TRIGGER trg_bank_line_classify BEFORE INSERT OR UPDATE ON banking.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION banking.bank_line_classify();

-- Backfill: every row passes through the classifier once (the trigger computes; nothing is typed). On the first pass
-- OLD.review_bucket is NULL, so every kind is DERIVED; a re-run keeps the kinds already set.
-- OWNER RULING 2026-10-02 (00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md §3): TRANSPORTATION is frozen —
-- not read, not written. Its rows are NOT backfilled (their bucket stays NULL until the freeze lifts; any write to one
-- would classify it through the trigger like every other row). Hence nullable columns and NOT VALID CHECKs below: each
-- binds every new write, and the post-conditions prove every non-frozen row explicitly.
UPDATE banking.bank_transactions SET review_bucket = review_bucket
 WHERE operating_company_id NOT IN (SELECT id FROM org.companies WHERE code = 'TRANSP');

-- Transfer provenance: the bank line that MINTED a transfer. Undo of that line revokes the transfer and releases both
-- sides; undo of a line that was only matched to an existing transfer releases that line alone (the transfer is a
-- pre-existing document — never deleted by a line that did not create it).
ALTER TABLE banking.transfers ADD COLUMN IF NOT EXISTS minted_from_bank_transaction_id uuid;
COMMENT ON COLUMN banking.transfers.minted_from_bank_transaction_id IS
  'ROUND 360: the bank feed line whose Transfer action created this transfer. NULL = entered directly (or pre-ROUND-360).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_line_review_bucket'
                    AND conrelid = 'banking.bank_transactions'::regclass) THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT chk_bank_line_review_bucket
      CHECK (review_bucket IN ('for_review', 'categorized', 'excluded')) NOT VALID;
  END IF;
  -- Every written row carries a bucket (the trigger guarantees it; the frozen company's unwritten rows are exempt).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_line_review_bucket_present'
                    AND conrelid = 'banking.bank_transactions'::regclass) THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT chk_bank_line_review_bucket_present
      CHECK (review_bucket IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_line_resolution_kind'
                    AND conrelid = 'banking.bank_transactions'::regclass) THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT chk_bank_line_resolution_kind
      CHECK ((review_bucket = 'categorized' AND resolution_kind IN ('added', 'matched', 'transfer', 'split'))
          OR (review_bucket IN ('for_review', 'excluded') AND resolution_kind IS NULL)) NOT VALID;
  END IF;
  -- THE LYING STATE IS IMPOSSIBLE: Categorized carries a live document; For review carries none.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_line_bucket_matches_link'
                    AND conrelid = 'banking.bank_transactions'::regclass) THEN
    ALTER TABLE banking.bank_transactions ADD CONSTRAINT chk_bank_line_bucket_matches_link
      CHECK (
        (review_bucket = 'categorized') = (
          num_nonnulls(matched_advance_id, matched_bill_id, matched_bill_payment_id, matched_expense_id,
                       matched_factoring_advance_id, matched_fuel_transaction_id, matched_invoice_id,
                       matched_journal_entry_id, matched_load_id, matched_payment_id, matched_relay_fuel_transaction_id,
                       matched_settlement_id, matched_transfer_id, linked_entity_id) > 0
          OR status IN ('split', 'transfer')
          OR transfer_kind IS NOT NULL)) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_bucket
  ON banking.bank_transactions (operating_company_id, review_bucket) WHERE voided_at IS NULL AND review_bucket IS NOT NULL;

COMMENT ON COLUMN banking.bank_transactions.review_bucket IS
  'ROUND 360: where the line sits — for_review | categorized | excluded (the three tabs). Derived by banking.bank_line_classify() from the line''s own links; never typed.';
COMMENT ON COLUMN banking.bank_transactions.resolution_kind IS
  'ROUND 360: how a categorized line got there — added (categorize created it) | matched (linked to a document that already existed) | transfer | split. NULL outside categorized.';

-- MATCHABLE AGAIN. The unmatch writer used to retire match rows for six kinds only, so a released line left its expense /
-- settlement / factoring-advance row live as 'user_matched' and the Match drawer hid that document from every line for
-- good. Measured 2026-10-03 (USMCA): 75 of 144 live match rows sit on a bank line that is voided or carries no document
-- (8 expenses + 21 driver settlements still live and hidden; 46 voided factoring advances). The writer now retires every
-- kind (recon-worklist.service.ts unmatchBankTransactionOnClient); this retires, once, the rows it would have retired —
-- voided with a reason, never deleted (WORM). Frozen company excluded.
UPDATE banking.reconciliation_matches m
   SET match_state = 'rejected',
       voided_at = now(),
       void_reason = 'ROUND 360: bank line released before unmatch retired every kind — document returned to the match pool',
       updated_at = now()
  FROM banking.bank_transactions bt
 WHERE bt.id = m.bank_transaction_id
   AND m.voided_at IS NULL
   AND m.match_state IN ('auto_matched', 'user_matched')
   AND m.operating_company_id NOT IN (SELECT id FROM org.companies WHERE code = 'TRANSP')
   AND (bt.voided_at IS NOT NULL
        OR NOT (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                             bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                             bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                             bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
                             bt.linked_entity_id) > 0
                OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL));

-- Post-conditions — every NON-FROZEN row (TRANSPORTATION is not read: owner ruling 2026-10-02).
DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad FROM banking.bank_transactions
   WHERE operating_company_id NOT IN (SELECT id FROM org.companies WHERE code = 'TRANSP')
     AND (review_bucket IS NULL OR review_bucket NOT IN ('for_review', 'categorized', 'excluded'));
  IF v_bad > 0 THEN RAISE EXCEPTION '202615350600: % lines without one of the three buckets', v_bad; END IF;
  SELECT count(*) INTO v_bad FROM banking.bank_transactions
   WHERE operating_company_id NOT IN (SELECT id FROM org.companies WHERE code = 'TRANSP')
     AND NOT ((review_bucket = 'categorized' AND resolution_kind IN ('added', 'matched', 'transfer', 'split'))
           OR (review_bucket IN ('for_review', 'excluded') AND resolution_kind IS NULL));
  IF v_bad > 0 THEN RAISE EXCEPTION '202615350600: % lines whose kind disagrees with their bucket', v_bad; END IF;
  SELECT count(*) INTO v_bad FROM banking.bank_transactions
   WHERE operating_company_id NOT IN (SELECT id FROM org.companies WHERE code = 'TRANSP')
     AND (review_bucket = 'categorized') IS DISTINCT FROM (
           num_nonnulls(matched_advance_id, matched_bill_id, matched_bill_payment_id, matched_expense_id,
                        matched_factoring_advance_id, matched_fuel_transaction_id, matched_invoice_id,
                        matched_journal_entry_id, matched_load_id, matched_payment_id, matched_relay_fuel_transaction_id,
                        matched_settlement_id, matched_transfer_id, linked_entity_id) > 0
           OR status IN ('split', 'transfer') OR transfer_kind IS NOT NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION '202615350600: % lines whose bucket disagrees with their document link', v_bad; END IF;
END $$;

COMMIT;
