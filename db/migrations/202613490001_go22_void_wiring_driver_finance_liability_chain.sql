-- GO-22 BUILD ORDER item 1 (owner direct instruction 2026-09-02, ~16:19Z). "VOID GAP" -- owner
-- flagged that a mistake in the loan/advance/bill chain currently has no exit under append-only
-- law. Verified live on br-fancy-credit-akjnd07a before writing this (information_schema.columns,
-- column_name ILIKE '%void%'): these five driver_finance tables carry NO void wiring at all --
-- no voided_at, no reason, no who -- and accounting.invoices has voided_at + void_reason but is
-- missing voided_by_user_id (every other voided-money table in this codebase carries all three).
--
--   driver_finance.driver_liabilities        <- the loan account itself
--   driver_finance.driver_advances
--   driver_finance.driver_bills
--   driver_finance.settlement_lines
--   driver_finance.driver_settlement_deductions
--   accounting.invoices                       (voided_by_user_id only -- the other two exist)
--
-- CORRECTION to the owner's list, verified before writing (not assumed): accounting.bill_payments
-- is NOT actually missing void wiring -- an ILIKE '%void%' column-name search misses it because it
-- uses a differently-named but equivalent triplet already wired end-to-end:
-- revoked_at / revoked_by_user_id / revoked_reason (columns exist; posting-engine.service.ts:1699
-- gates GL exemption on `payment.revoked_at || payment.status === "void"`). Same naming-drift shape
-- as the invoice_lines.display_order/line_sequence landmine -- a text-match check on "void" alone
-- is not proof of an actual gap. bill_payments is intentionally excluded from this migration.
--
-- Column names/types match the existing pattern used everywhere else in this codebase (e.g.
-- accounting.invoices.voided_at/void_reason, driver_finance.driver_settlements.voided_at/
-- void_reason/voided_by_user_id, driver-payment-methods.service.ts's UPDATE ... voided_at = now(),
-- voided_by_user_id = $x, void_reason = $y) so the same UPDATE shape every void route already uses
-- works unchanged against these tables. Additive, idempotent, CREATE-only -- IF NOT EXISTS
-- throughout, never DROP. Void is a reversal with a register, never DELETE FROM; this migration
-- only adds the register columns -- the application-layer void endpoints are separate work.
--
-- No new RLS policy needed -- all six tables already carry FORCED RLS + entity policies from their
-- origin migrations; adding a column does not change that. No new grants needed -- verified live
-- (information_schema.role_table_grants) that ih35_app already holds SELECT/INSERT/UPDATE (no
-- DELETE) on every one of the five driver_finance tables and on accounting.invoices, which is
-- exactly what a void-by-UPDATE needs and no more.
--
-- REVISION (owner mid-slice correction, 2026-09-02 ~17:20Z, after this migration's first half was
-- already applied to prod): a live re-check found (a) the five driver_finance tables above now
-- read as HAVING void_reason/voided_at/voided_by_user_id -- true, but only because THIS migration's
-- first BEGIN/COMMIT block already applied those columns to prod minutes earlier in this same
-- session, not because they pre-existed; (b) accounting.vendor_credits has NO void wiring at all
-- (re-verified live just now, empty result) -- a real, previously-unlisted gap; (c) none of the
-- five driver_finance tables, nor bill_payments/vendor_credits, carry a void_reversal_entry_id link
-- to the reversing accounting.journal_entries row -- "a void with no reversal entry is not a void."
-- accounting.bill_payments keeps its existing revoked_at/revoked_by_user_id/revoked_reason triplet
-- unchanged (it is live-wired, posting-engine.service.ts:1699) -- this only adds the
-- void_reversal_entry_id link column it was missing, matching the naming the owner asked for
-- verbatim (voided_at/void_reason/voided_by_user_id) alongside it rather than silently overloading
-- the existing revoked_* columns, per direct instruction. The write-path/read-path-filter/
-- reversing-JE-writer work for all seven tables is application-layer follow-up, tracked in the PR
-- body -- this migration is the register those writers need to exist before they can be built.

BEGIN;

ALTER TABLE driver_finance.driver_liabilities
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE driver_finance.driver_bills
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE driver_finance.settlement_lines
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id);

-- Partial indexes for the "exclude voided" read every list/aging/balance query needs -- same shape
-- as the existing driver_settlements tour-open index (migration 202613450001).
CREATE INDEX IF NOT EXISTS ix_driver_liabilities_not_voided
  ON driver_finance.driver_liabilities (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_driver_advances_not_voided
  ON driver_finance.driver_advances (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_driver_bills_not_voided
  ON driver_finance.driver_bills (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_settlement_lines_not_voided
  ON driver_finance.settlement_lines (settlement_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_driver_settlement_deductions_not_voided
  ON driver_finance.driver_settlement_deductions (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN driver_finance.driver_liabilities.voided_at IS
  'GO-22 void-gap fix (owner 2026-09-02) -- a mistake in the advance/bill/loan chain now has an exit. Void = reversal, never DELETE.';
COMMENT ON COLUMN driver_finance.driver_advances.voided_at IS
  'GO-22 void-gap fix (owner 2026-09-02) -- same register as driver_liabilities.voided_at.';
COMMENT ON COLUMN driver_finance.driver_bills.voided_at IS
  'GO-22 void-gap fix (owner 2026-09-02) -- same register as driver_liabilities.voided_at.';
COMMENT ON COLUMN driver_finance.settlement_lines.voided_at IS
  'GO-22 void-gap fix (owner 2026-09-02) -- same register as driver_liabilities.voided_at.';
COMMENT ON COLUMN driver_finance.driver_settlement_deductions.voided_at IS
  'GO-22 void-gap fix (owner 2026-09-02) -- same register as driver_liabilities.voided_at.';
COMMENT ON COLUMN accounting.invoices.voided_by_user_id IS
  'GO-22 void-gap fix (owner 2026-09-02) -- invoices already had voided_at/void_reason; voided_by_user_id was the missing author column every other voided-money table carries.';

COMMIT;

-- ============================================================================
-- PART 2 (owner revision, same session, 2026-09-02 ~17:20Z): void_reversal_entry_id on the five
-- driver_finance tables above, plus full void wiring on accounting.bill_payments (naming
-- verbatim-as-instructed alongside the existing revoked_* triplet) and accounting.vendor_credits
-- (genuine gap, no prior void wiring of any kind, re-verified live before writing this).
-- ============================================================================

BEGIN;

ALTER TABLE driver_finance.driver_liabilities
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE driver_finance.driver_bills
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE driver_finance.settlement_lines
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE accounting.bill_payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reversal_entry_id uuid NULL REFERENCES accounting.journal_entries(id);

CREATE INDEX IF NOT EXISTS ix_bill_payments_not_voided
  ON accounting.bill_payments (operating_company_id, bill_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_vendor_credits_not_voided
  ON accounting.vendor_credits (operating_company_id, vendor_id)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN driver_finance.driver_liabilities.void_reversal_entry_id IS
  'GO-22 void-gap fix part 2 (owner 2026-09-02) -- a void with no reversal entry is not a void; links the voiding UPDATE to the reversing accounting.journal_entries row.';
COMMENT ON COLUMN accounting.bill_payments.voided_at IS
  'GO-22 void-gap fix part 2 (owner 2026-09-02) -- added alongside the pre-existing, live-wired revoked_at/revoked_by_user_id/revoked_reason triplet (posting-engine.service.ts) per explicit owner naming instruction; not a replacement for revoked_*.';
COMMENT ON COLUMN accounting.vendor_credits.voided_at IS
  'GO-22 void-gap fix part 2 (owner 2026-09-02) -- vendor_credits had no void wiring of any kind before this; verified live and empty prior to this migration.';

COMMIT;
