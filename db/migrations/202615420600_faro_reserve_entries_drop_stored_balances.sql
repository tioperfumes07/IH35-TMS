-- 202615420600 — CC-2 (claimed #25403). KILL THE SECOND SYSTEM (owner order 2026-10-03), tables 10 + 11, step 2 of 2.
--
-- accounting.faro_reserve_entries stored, per row, Faro's printed running balance (running_balance_cents) and the
-- short-pay "Balance:" figure (short_pay_balance_cents). Both are a parallel running total: the import refuses any row
-- whose previous balance + amount != printed balance, and checks the short-pay arithmetic from the note it stores, so
-- each value is recomputable from the movement rows. The GL that owns the number is 1230 / 1235 (factor_reserve_held /
-- factor_cash_reserve_held).
--
-- Step 1 (#25401) repointed every reader and writer: the register balance is derived from Faro's statement balance,
-- kept on the register account (banking.bank_accounts.current_balance_cents, which the tie-out engine compares to the
-- register's GL account), minus every later movement. Measured before this file: 0 rows in the table, 0 views and 0
-- functions reference either column, and no application code reads or writes them.
--
-- KEPT: every movement row, the note (with Faro's short-pay text), short_pay_paid_cents, the short-pay resolution and
-- its credit memo. Nothing is backfilled.

ALTER TABLE accounting.faro_reserve_entries DROP COLUMN IF EXISTS running_balance_cents;
ALTER TABLE accounting.faro_reserve_entries DROP COLUMN IF EXISTS short_pay_balance_cents;
