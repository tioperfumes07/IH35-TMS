-- BANK-F06 — add the account-visibility columns the code has always written but that never existed.
--
-- THE DEFECT (verified on prod br-fancy-credit-akjnd07a 2026-08-04). banking.routes.ts
-- POST /api/v1/banking/accounts/visibility executes:
--     UPDATE banking.bank_accounts
--        SET visible = $2, display_order = $3, tag = COALESCE($4, tag), is_dip = COALESCE($5, is_dip)
-- Of those four columns only `display_order` exists. The statement therefore raises
-- "column \"visible\" does not exist" on EVERY call — the endpoint has never worked.
--
-- THE DOWNSTREAM CONSEQUENCE, which is the money-visible half. views.banking_account_tiles is a dead
-- stub (SELECT NULL::uuid ... WHERE false) that exposes tag / is_dip / tile_kind and can never return
-- a row. The Banking Home KPI aggregates that view for total_dip_cash, dip_operating, dip_payroll,
-- factoring_reserve and driver_escrow, so kpiRes.rows[0] is always undefined and the fallback supplies
-- 0 for all five. Banking Home reports $0 DIP cash while the entity holds real balances
-- (Business Platinum $35,518.52; checking ...6103 $3,834.49, ...6137 $536.78, ...6129 $346.11).
-- DIP cash reading $0 is Chapter 11 reporting-relevant, and it fails silently — no error, no empty
-- state, just a zero a human is expected to trust.
--
-- The view was written against a schema that was never built. This migration builds the schema the
-- application already assumes, so the write path works and the KPI has an authoritative source to read
-- instead of a stub.
--
-- ADDITIVE AND SAFE: three nullable/defaulted columns on an existing table. No data is rewritten, no
-- column is dropped or renamed, and no existing row changes meaning — `visible` defaults true (current
-- behaviour: every account shows) and `is_dip` defaults false (no account is claimed as DIP until an
-- operator tags it). `tag` stays NULL, so the KPI keeps reporting 0 for the tagged buckets until real
-- classification is entered — 0 because nothing is tagged yet, which is honest, rather than 0 because
-- a view is dead, which is not.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). No DELETE. Entity-agnostic — no hardcoded UUID.

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tag     text,
  ADD COLUMN IF NOT EXISTS is_dip  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN banking.bank_accounts.visible IS
  'BANK-F06: operator-controlled tile visibility. Defaults true = prior behaviour (all accounts shown).';
COMMENT ON COLUMN banking.bank_accounts.tag IS
  'BANK-F06: operator classification driving the Banking Home KPI buckets — DIP Operating, DIP Payroll, DIP Other, Factoring, Escrow. NULL = unclassified.';
COMMENT ON COLUMN banking.bank_accounts.is_dip IS
  'BANK-F06: debtor-in-possession account flag (Ch.11 reporting). Defaults false — an account is DIP only when an operator says so.';
