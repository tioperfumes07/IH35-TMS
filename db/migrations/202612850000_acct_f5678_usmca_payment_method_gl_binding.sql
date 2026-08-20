-- ACCT-F5678 — root-cause fix for LV-ESCROW-CONFIGURED-NEVER-ACCRUED (the row's own instruction:
-- "investigate why settlements never reach closed before attempting a fix" — this migration is
-- that fix, after the investigation).
--
-- ROOT CAUSE, live-verified 2026-08-21 (bypass own-statement, current_user asserted):
-- closeSettlementPayRun's resolvePaymentMethod() (settlement-payrun-close.service.ts:292-315)
-- deliberately refuses to disburse via a payment method whose gl_account_id is unset — migration
-- 202607380000's own header calls this out explicitly: "refuses to disburse via a method whose
-- gl_account_id is unset" — an intentional, designed fail-closed gate, not an oversight. EVERY
-- active payment method on EVERY entity (TRANSP, TRK, USMCA — 27 rows total) has gl_account_id =
-- NULL. Consequence: closeSettlementPayRun cannot succeed for ANY settlement on ANY entity, and
-- the $2,500 escrow-contribution policy — which accrues only at pay-run close — has never fired
-- for a single driver anywhere in the system.
--
-- SCOPE: USMCA ONLY. TRANSP carries 5 active bank accounts (general operating, savings, a
-- trucking LOAN account, an Amex CARD account, and the Relay Fuel Wallet) — genuinely ambiguous
-- which backs driver payroll disbursement, and binding the wrong one would mislabel every future
-- driver settlement's cash source; that stays a routed board item for an explicit owner call.
-- USMCA carries exactly 2 active bank accounts: "Bank of America - Operating (USMCA)" (acct 1000,
-- general-purpose, created 2026-06-30 — earliest) and "Relay Fuel Wallet" (acct 1295, a NAMED
-- special-purpose fuel-card account this same codebase already excludes from general disbursement
-- elsewhere, e.g. insurance/dispersal.routes.ts's own bank-account-hide filtering). This is
-- unambiguous: every USMCA payment method binds to the Operating account. This also matches the
-- codebase's own established precedent for "pick the account when only one general-purpose choice
-- exists" (ORDER BY created_at ASC LIMIT 1, same pattern insurance/dispersal.routes.ts uses).
--
-- IDEMPOTENT: only sets gl_account_id where currently NULL (never overwrites an owner's later
-- choice); a re-run is a no-op once bound.

BEGIN;

UPDATE catalogs.payment_methods
SET gl_account_id = 'c7af1219-f6a6-4169-a2d8-8f556fb0c2f3'::uuid, -- catalogs.accounts 1000, Bank of America - Operating (USMCA)
    updated_at = now()
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid -- USMCA
  AND is_active = true
  AND voided_at IS NULL
  AND gl_account_id IS NULL;

COMMIT;
