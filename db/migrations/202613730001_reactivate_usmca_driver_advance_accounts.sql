BEGIN;

-- REVERSAL of 202613690001 (owner order 2026-09-04, verbatim: "REVERSE THE DEACTIVATION. ORCH
-- ERROR, NOT YOURS."). driver-subaccount-provision.service.ts auto-creates, on every driver
-- creation, BOTH a per-driver ASSET sub-account under "Driver Cash Advance" and a per-driver
-- LIABILITY escrow sub-account. Live: 21 escrow accounts, 12 advance accounts. The parent carries
-- TWO live roles in accounting.chart_of_accounts_roles: advance_recovery and
-- driver_payroll_clearing. These are operating chart accounts, not artifacts of the
-- owner-operator model 202613690001 was written to correct.
--
-- WHAT MAKES THEM NECESSARY, per the owner's own GO-23 pre-settlement ruling (same session):
-- "IF THERE IS NO LOAD, AUTOMATICALLY CREATES A LOAN TO DRIVER." A loan is a receivable and it
-- lands in the driver's asset sub-account. The distinction 202613690001 got right is the
-- INSTRUMENT, not the account: a fuel advance (US -> driver, no load) is a company expense, DR
-- fuel expense / CR bank, no receivable, because he is a B1 company employee -- that still stands.
-- A cash advance with NO load is a LOAN, a real receivable, and it still needs a real asset
-- account to land in.
--
-- Reactivates the SAME 12 rows 202613690001 deactivated, idempotent (WHERE is_active = false),
-- UPDATE only -- never a delete. The claim registry entry for 202613690001 stays in place
-- unedited; this migration is the correction, not a rewrite of history.
UPDATE driver_finance.driver_advance_accounts daa
   SET is_active = true,
       updated_at = now()
  FROM catalogs.accounts ca
 WHERE ca.id = daa.coa_account_id
   AND daa.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND ca.account_name LIKE 'Driver Cash Advance-%'
   AND daa.is_active = false;

COMMIT;
