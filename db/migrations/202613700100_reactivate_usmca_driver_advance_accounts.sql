BEGIN;

-- LOAD-COSTS-COMPLETE money item (6) (owner correction 2026-09-04, verbatim): "REACTIVATE the 12
-- driver_advance_accounts. My error: they are the auto-provisioned asset half of every driver
-- (driver-subaccount-provision.service.ts), parent bound to advance_recovery and
-- driver_payroll_clearing. A 'loan to driver' lands there."
--
-- REVERSES migration 202613690001 (this same lane, same session-day). That migration deactivated
-- USMCA's 12 driver_advance_accounts rows on the theory that a fuel advance to a company (B1)
-- driver is always a one-shot company expense with no receivable -- true for THAT specific
-- transaction, but it over-reached: driver_finance.driver_advance_accounts is the general-purpose
-- auto-provisioned asset bridge every driver gets (driver-subaccount-provision.service.ts,
-- provisionDriverAdvanceAccount, upserts is_active=true by design, parent-bound to the
-- advance_recovery / driver_payroll_clearing CoA roles), not a fuel-advance-specific account.
--
-- Owner's own standing ruling (same 2026-09-04 correction) draws the real line: "Driver needs money
-- mid-tour -> cash advance: with a load it is a BILL PAYMENT against that load [-> driver_bills, no
-- driver_advance_accounts involved]; with no load it creates a LOAN TO DRIVER [-> THIS account is
-- the asset side of that loan]." Deactivating these accounts blocked every legitimate no-load loan
-- from having anywhere to post. Fuel advances stay correctly wired through LoadDetailCostsTab's
-- new "+ Fuel advance" quick-create (accounting.expenses, DR fuel expense / CR bank -- never this
-- table); this migration does not touch that path at all.
--
-- Idempotent: only touches rows this session itself deactivated (updated_at unchanged since would
-- be a no-op re-run; re-running after a legitimate future deactivation would incorrectly reactivate
-- it too, so this is scoped to exactly the 12 USMCA rows the prior migration touched, identified the
-- same way that migration selected them -- operating_company_id + is_active). A driver added AFTER
-- 202613690001 ran would already be provisioned is_active=true by the provisioning service itself
-- and is untouched by either migration.

UPDATE driver_finance.driver_advance_accounts
   SET is_active = true,
       updated_at = now()
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND is_active = false;

COMMENT ON COLUMN driver_finance.driver_advance_accounts.is_active IS
  'USMCA''s 12 Driver Cash Advance accounts were deactivated 2026-09-04 (202613690001, LOAD-COSTS-COMPLETE item (3)) on the mistaken theory that this table only models an owner-operator receivable; REACTIVATED the same day (202613700100) once the owner clarified it is the general-purpose auto-provisioned asset bridge every driver gets, and is the correct landing spot for a no-load mid-tour cash advance ("loan to driver"). Never deleted (void/never-delete law) at either step.';

COMMIT;
