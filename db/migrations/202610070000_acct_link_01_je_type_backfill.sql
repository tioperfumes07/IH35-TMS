-- [HOLD-FOR-JORGE — FINANCIAL] ACCT-LINK-01 — backfill journal_entry_type_id (density).
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- ROOT CAUSE: mig 202607960000 added journal_entry_type_id + FK, but auto posters left it NULL
--   (resolveJournalEntryTypeId only defaulted GENERAL for source=manual). Live Neon 2026-07-28:
--   8 JEs, 0 typed (0% inbound density) while catalogs.journal_entry_types has 16 active codes.
--
-- FIX: idempotent memo/source heuristic backfill → typed rows. No new GL math. No JE create/void.
-- Write-path fix lands in journal-entries.service.ts (inferJournalEntryTypeCode) same PR.

BEGIN;

DO $$
DECLARE
  v_general uuid;
  v_ob uuid;
  v_inv uuid;
  v_bill uuid;
  n_updated int := 0;
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL
     OR to_regclass('catalogs.journal_entry_types') IS NULL THEN
    RAISE NOTICE 'ACCT-LINK-01 backfill: tables missing — skip';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting'
      AND table_name = 'journal_entries'
      AND column_name = 'journal_entry_type_id'
  ) THEN
    RAISE NOTICE 'ACCT-LINK-01 backfill: journal_entry_type_id absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_general FROM catalogs.journal_entry_types WHERE code = 'GENERAL' AND is_active LIMIT 1;
  SELECT id INTO v_ob FROM catalogs.journal_entry_types WHERE code = 'OPENING_BALANCE' AND is_active LIMIT 1;
  SELECT id INTO v_inv FROM catalogs.journal_entry_types WHERE code = 'SALES_INVOICE' AND is_active LIMIT 1;
  SELECT id INTO v_bill FROM catalogs.journal_entry_types WHERE code = 'BILL' AND is_active LIMIT 1;

  IF v_general IS NULL THEN
    RAISE EXCEPTION 'ACCT-LINK-01 backfill: GENERAL journal_entry_type missing — refuse';
  END IF;

  UPDATE accounting.journal_entries je
  SET journal_entry_type_id = CASE
        WHEN lower(coalesce(je.memo, '')) LIKE '%opening balance%' AND v_ob IS NOT NULL THEN v_ob
        WHEN lower(coalesce(je.memo, '')) LIKE '%invoice%' AND lower(coalesce(je.memo, '')) LIKE '%posting%' AND v_inv IS NOT NULL THEN v_inv
        WHEN lower(coalesce(je.memo, '')) LIKE 'bill %' AND v_bill IS NOT NULL THEN v_bill
        ELSE v_general
      END,
      updated_at = now()
  WHERE je.journal_entry_type_id IS NULL;

  GET DIAGNOSTICS n_updated = ROW_COUNT;
  RAISE NOTICE 'ACCT-LINK-01 backfill: typed % journal_entries rows', n_updated;
END
$$;

COMMIT;
