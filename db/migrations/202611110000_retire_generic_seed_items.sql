-- ACCT-F77 — retire the 5 GENERIC SEED items that block the QBO item sync.
--
-- ROOT CAUSE (proven on prod 2026-08-01, not inferred from the symptom):
-- qbo_sync.step.items_pull and .items_reconcile have NEVER succeeded, failing with
--   duplicate key value violates unique constraint "uq_items_company_item_name"
-- The QBO upsert matches its twin row on the PARTIAL arbiter (operating_company_id, qbo_item_id) and
-- its DO UPDATE SET item_name = EXCLUDED.item_name then tries to rename
--   'Fuel Surcharge [QBO 24]' -> 'Fuel Surcharge'   and   'Layover Charge [QBO 26]' -> 'Layover Charge'
-- Both target names are already held by GENERIC SEED rows, and uq_items_company_item_name is NOT
-- partial, so the rename collides and the whole step aborts.
--
-- WHY THESE 5 ROWS ARE NOT BUSINESS DATA — traced to their origin, not assumed:
-- db/migrations/0062_p3_t11_21_0_catalog_seed_data.sql:196-200 created them with the literal note
-- 'Generic seeded item' and invented round prices (Linehaul $1,000.00, FSC $150.00, Detention
-- $100.00, Layover $120.00, Lumper $85.00). On prod today they still carry that exact note and those
-- exact prices, with qbo_item_id NULL, default_income_account_id NULL, and ZERO references from
-- accounting.invoice_lines. They are untouched 2026-05-12 scaffolding.
--
-- THE REPO ALREADY RULED ON THIS: 202607950000_catalogs_items_backfill_from_qbo_mirror.sql:62-67 says
-- "Never shadow an existing canonical row that already carries the same name for this entity." That
-- backfill deferred to whichever row held the name — which was the generic seed. The seed won a
-- collision it should never have been in.
--
-- WHY RENAME AND NOT ONLY ARCHIVE: uq_items_company_item_name is NOT partial, so a row with
-- deactivated_at set STILL occupies the name and the sync stays broken forever. Freeing the name is
-- the fix; archiving alone is not.
--
-- ACCOUNTING POSITION: under parallel-books QuickBooks is the system of record for products/services.
-- A TMS mirroring QBO must not keep a competing item of the same name — two 'Fuel Surcharge' rows mean
-- two possible revenue accounts for one charge, and the generic one has NO income account, which
-- buildInvoiceLines hard-fails on. NetSuite prevents this by keying items to an external id; McLeod and
-- Alvys treat accessorial charge codes as 1:1 with a revenue item. A duplicate charge code is a
-- billing-integrity defect, not a cosmetic one.
--
-- VOID, NEVER DELETE: rows are renamed + deactivated, so they stay findable in audit and can be
-- restored by clearing deactivated_at. Idempotent: only untouched generic seeds are matched, and the
-- name suffix makes a second run a no-op.

DO $$
DECLARE
  v_renamed int := 0;
BEGIN
  IF to_regclass('catalogs.items') IS NULL THEN
    RAISE NOTICE 'catalogs.items absent — skipping ACCT-F77';
    RETURN;
  END IF;

  UPDATE catalogs.items
     SET item_name = item_name || ' (generic seed — retired)',
         deactivated_at = COALESCE(deactivated_at, now()),
         updated_at = now()
   WHERE qbo_item_id IS NULL
     AND deactivated_at IS NULL
     AND notes = 'Generic seeded item'
     AND item_code IN ('LINEHAUL', 'FSC', 'DETENTION', 'LUMPER', 'LAYOVER')
     AND item_name NOT LIKE '%(generic seed — retired)'
     -- Never retire a row an operator has actually put to work.
     AND default_income_account_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM accounting.invoice_lines il WHERE il.account_id = catalogs.items.id
     );

  GET DIAGNOSTICS v_renamed = ROW_COUNT;
  RAISE NOTICE 'ACCT-F77: retired % generic seed item(s)', v_renamed;
END $$;
