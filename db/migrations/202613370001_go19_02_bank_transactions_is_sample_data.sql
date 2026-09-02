-- 202613370001_go19_02_bank_transactions_is_sample_data.sql
-- GO-19 (docs/lockdown/GO-19-BUILD-QUEUE.md, slice 02, CC-1 seat item) -- "mark/hide the existing 34
-- USMCA bank fixtures. Never delete. Never invent new bank rows."
--
-- Live-verified gap (2026-09-01, information_schema): banking.bank_transactions has no is_sample_data
-- column. The 34 GO-11 fixture rows for USMCA are already soft-voided (voided_at set) under two exact
-- voided_reason values from prior sessions:
--   - 'owner_void_all_usmca_test_2026-08-11'                                                (24 rows)
--   - 'OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01: remove seat test/demo/sample contamination;
--      keep Plaid bank feed'                                                                (10 rows)
-- distinct from 3 unrelated 'replaced_by_plaid_posted:*' rows (legitimate Plaid stub-merges, not
-- fixtures -- left is_sample_data = false).
--
-- Additive only, idempotent, no destructive change. Every existing row not matching the two exact
-- voided_reason values above defaults is_sample_data = false and is untouched.

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_is_sample_data
  ON banking.bank_transactions (operating_company_id, is_sample_data)
  WHERE is_sample_data = true;

-- Backfill: mark exactly the 34 known GO-11/USMCA-seat-purge fixture rows. Scoped by the exact
-- business identifier (voided_reason text), not a heuristic -- matches the owner's fixture-marking
-- convention (docs skill ih35-financial-migrations §3: fixtures identified by exact business
-- identifier, business rows never touched). Re-running this UPDATE is a no-op the second time since
-- it is idempotent on the predicate, not on a one-shot flag.
UPDATE banking.bank_transactions
SET is_sample_data = true
WHERE voided_reason IN (
  'owner_void_all_usmca_test_2026-08-11',
  'OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01: remove seat test/demo/sample contamination; keep Plaid bank feed'
)
AND is_sample_data = false;

-- Guard: no NEW row may ever be written with is_sample_data = true against a live company (all
-- companies, not just USMCA -- the invariant is "sample rows are never live-written", not
-- "only USMCA is protected"). A trigger, not a CHECK constraint, because it must also allow the
-- backfill UPDATE above to run once via migration (BEFORE INSERT only -- backfill is an UPDATE).
CREATE OR REPLACE FUNCTION banking.forbid_sample_bank_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_sample_data THEN
    RAISE EXCEPTION
      'E_SAMPLE_BANK_TRANSACTION_INSERT_FORBIDDEN: is_sample_data=true may not be set on INSERT (GO-19-02 invariant). Fixture rows are marked via a scoped backfill UPDATE only, never written live.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_forbid_sample_bank_transaction_insert ON banking.bank_transactions;
CREATE TRIGGER trg_forbid_sample_bank_transaction_insert
  BEFORE INSERT ON banking.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION banking.forbid_sample_bank_transaction_insert();
