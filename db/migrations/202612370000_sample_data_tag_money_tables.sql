-- ACCT-F187 (board card SAMPLE-TAG-MONEY-TABLES-MISSING) — the go-live sample-data tag exists on the
-- OPERATIONAL tables and on exactly ONE money table. Every accounting document created as "sample"
-- currently lands with no BOOLEAN column capable of saying so (a free-text Gate-B tag IS available on
-- every one of them — see the correction below; that is why this is an enhancement, not an emergency).
--
-- VERIFIED ON PROD br-fancy-credit-akjnd07a (pg_attribute, RLS-immune) before writing this:
--   HAS is_sample_data : mdata.loads · mdata.customers · mdata.vendors · driver_finance.driver_settlements
--   MISSING            : accounting.bills · accounting.invoices · accounting.payments
--                        accounting.bill_payments · accounting.journal_entries · accounting.expenses
--                        driver_finance.settlement_lines
--
-- THIS IS AN ENHANCEMENT, NOT AN EMERGENCY — and I am correcting my own first framing of it. I filed the
-- board card as a P0 claiming there was "no way to say so". That was WRONG: every one of the seven tables
-- carries a free-text field (bills.memo, invoices.internal_notes, payments.notes/reference,
-- bill_payments.memo, journal_entries.memo, expenses.memo, settlement_lines.description — all verified on
-- prod), and the Gate-B tag convention already uses them. The header of verify-settlement-sample-tag-wired
-- (step 2817) states the design outright: settlements got a COLUMN precisely because it was the ONE type
-- with no free-text field. I filed a P0 without reading the guard standing next to the finding.
--
-- WHAT THE COLUMN STILL GENUINELY BUYS, and why this is worth shipping anyway:
--   · STRUCTURED, not string-matched — no typo, no truncation, and no LIKE '%SAMPLE%' false positive on a
--     legitimate memo that happens to contain the word.
--   · INDEXABLE — see the partial indexes below; "exclude sample rows from this report" becomes cheap.
--   · SURVIVES A MEMO EDIT. A free-text tag is one careless correction away from vanishing, and the row it
--     was marking then reads as real financial data forever.
--
-- ADDITIVE AND NON-RETROACTIVE, which is the whole point:
--   · DEFAULT false + NOT NULL, so EVERY EXISTING ROW KEEPS ITS CURRENT MEANING. Nothing already on the
--     books is retro-labelled as sample data — that would be a far worse defect than the one being fixed.
--   · ADD COLUMN with a non-volatile default does not rewrite the table in PostgreSQL 11+, so this is
--     cheap even on accounting.bills (16,261 rows) and accounting.invoices (11,987).
--   · IF NOT EXISTS throughout: re-running is a no-op, and tables that already carry the column are
--     skipped rather than altered.
--   · No RLS, policy, grant, index or data change. The column inherits the table's existing policies.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: it does not tag anything. Deriving the value on write
-- (opts.isSampleData ?? load.is_sample_data ?? false, exactly as
-- driver-finance/settlements-load-bookended.service.ts:158 already does) is application work and ships
-- with its guard. A migration that guessed which existing rows were "sample" would be inventing
-- financial classification — the same class of error as backfilling a load FK onto imported history.

DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'accounting.bills',
    'accounting.invoices',
    'accounting.payments',
    'accounting.bill_payments',
    'accounting.journal_entries',
    'accounting.expenses',
    'driver_finance.settlement_lines'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %s ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false',
        t
      );
      RAISE NOTICE 'ACCT-F187: is_sample_data present on %', t;
    ELSE
      -- Not an error: a table absent on this database simply has nothing to tag. Skipping keeps the
      -- migration replayable against a fresh CI database built from migrations alone.
      RAISE NOTICE 'ACCT-F187: % absent, skipped', t;
    END IF;
  END LOOP;
END
$$;

-- Partial indexes on the sample rows only. Sample data is expected to stay a tiny minority, so a partial
-- index costs almost nothing and makes the two operations this column exists for — "exclude sample rows
-- from a financial report" and "find every sample row to clean it up" — cheap on the two largest tables.
DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bills_sample_data
      ON accounting.bills (operating_company_id) WHERE is_sample_data;
  END IF;
  IF to_regclass('accounting.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_sample_data
      ON accounting.invoices (operating_company_id) WHERE is_sample_data;
  END IF;
END
$$;
