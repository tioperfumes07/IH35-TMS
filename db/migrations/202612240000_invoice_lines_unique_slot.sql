-- ACCT-F145 — accounting.invoice_lines is the only money line table with no slot uniqueness, and it
-- is about to receive a 33,429-row backfill.
--
-- WHY NOW, AND WHY THIS MUST LAND BEFORE THE PROJECTION. Verified on prod (pg_index, RLS-bypassed):
--     accounting.bill_lines           UNIQUE (bill_id, line_sequence)
--     accounting.expense_lines        UNIQUE (expense_id, line_sequence)
--     accounting.payment_applications UNIQUE (payment_id, target_kind, target_id)
--     accounting.invoice_lines        ...only invoice_lines_pkey (id)
-- Every sibling protects its line slot; the AR one does not. That has cost nothing so far only
-- because the table holds 8 rows. It is about to hold ~33,437: ACCT-F144 established that all 11,976
-- QBO-cloned invoices are LINELESS while 33,429 line items sit unprojected in
-- mdata.qbo_ar_invoices.payload_json (100% of rows carry a `Line` array). A projection job writing
-- that volume into a table with no uniqueness means ONE retry — a timeout, a resumed batch, a rerun
-- after a partial failure — silently doubles revenue detail, and nothing would refuse it.
--
-- So the constraint is not paperwork ahead of the real work; it is the thing that makes the real work
-- safe to retry. Standard practice at every reference package: QBO/NetSuite/McLeod all key an invoice
-- line by (document, line number) precisely so a re-post cannot duplicate revenue.
--
-- THE COLUMN IS display_order, NOT line_sequence. Verified on prod: information_schema reports
-- has_line_sequence=0, has_display_order=1 for accounting.invoice_lines. Its AP siblings use
-- `line_sequence`; AR diverged. The inconsistency is real and is recorded on the board rather than
-- renamed here — renaming a column under a table that eight services read is its own block, and
-- doing it in the same migration that adds a constraint would make both harder to reason about.
--
-- SCOPE: partial, excluding soft-deleted rows, so correcting a line by soft-deleting and re-adding it
-- at the same slot stays legal. Not scoped by origin — unlike ACCT-F142 on bills, there is no
-- imported-history problem here: the QBO mirror rows are not in this table at all yet, and the
-- projection that puts them there will assign slots itself.
--
-- Idempotent: IF NOT EXISTS + to_regclass guard.

DO $$
BEGIN
  IF to_regclass('accounting.invoice_lines') IS NULL THEN
    RAISE NOTICE 'ACCT-F145: accounting.invoice_lines absent — skipping';
    RETURN;
  END IF;

  -- Verified clean on prod before writing this: 8 live lines across 8 invoices, 0 NULL display_order,
  -- 0 duplicate (invoice_id, display_order) pairs. The index installs without remediation, which is
  -- exactly why it is worth doing NOW rather than after the backfill creates work to undo.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_lines_invoice_slot
    ON accounting.invoice_lines (invoice_id, display_order)
    WHERE soft_deleted_at IS NULL
      AND display_order IS NOT NULL;

  RAISE NOTICE 'ACCT-F145: invoice_lines slot uniqueness installed (invoice_id, display_order)';
END
$$;
