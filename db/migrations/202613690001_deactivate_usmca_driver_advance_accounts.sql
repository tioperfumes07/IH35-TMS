BEGIN;

-- LOAD-COSTS-COMPLETE item (3) (owner ruling 2026-09-04, verbatim): "we never send fuel advance
-- to a driver, very rarely from the company... the fuel advance from us to the driver is a
-- company expense. he is a company driver, not an owner operator."
--
-- driver_finance.driver_advance_accounts is the funding-account side of the owner-operator
-- receivable-from-driver model: 12 active Asset-type accounts, "Driver Cash Advance- <driver
-- name>", account_number DRIVERCASHAD896665-007..-020, created 2026-08-21, one per USMCA driver.
-- Live-verified before this migration: driver_finance.driver_advances (the transaction table that
-- would actually draw against these accounts) is 0 rows for USMCA -- this is corrected BEFORE the
-- first row, not unwound after a real advance already used this model.
--
-- A fuel advance TO a company (B1) driver is a one-shot company expense (DR fuel expense, CR
-- bank) -- no receivable, no outstanding balance, no settlement recovery, no amortization. These
-- 12 Asset accounts encode the opposite model and must never fund a new advance.
--
-- Deactivate only -- NEVER delete (void/never-delete law). is_active=false keeps the register
-- (driver name, account number, historical linkage) intact for anyone who looks the account up,
-- while making it unusable as a funding source going forward.
--
-- Idempotent: only touches rows that are currently active for USMCA.

UPDATE driver_finance.driver_advance_accounts
   SET is_active = false,
       updated_at = now()
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND is_active = true;

COMMENT ON COLUMN driver_finance.driver_advance_accounts.is_active IS
  'USMCA''s 12 Driver Cash Advance accounts were deactivated 2026-09-04 (LOAD-COSTS-COMPLETE item (3)) -- they encode an owner-operator receivable-from-driver model that never legitimately applies to a USMCA B1 company driver. Never deleted (void/never-delete law); is_active=false keeps the register for lookup, blocks new use as a funding source.';

COMMIT;
