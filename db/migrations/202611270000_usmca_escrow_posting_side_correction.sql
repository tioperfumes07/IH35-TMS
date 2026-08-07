-- ACCT-F99 — USMCA escrow/escrow was mapped posting_side='debit' against a LIABILITY account.
--
-- THE DEFECT (verified live on prod br-fancy-credit-akjnd07a, 2026-08-03, completeness discriminator
-- applied: catalogs.accounts visible 1441 == n_live_tup 1441):
--
--   opco    mapping        account                                  account_type  posting_side
--   TRANSP  escrow/escrow  QBO-1150040187 Damage Claim Escrow       Liability     credit   OK
--   TRK     escrow/escrow  TRK-QBO-1150040187 Damage Claim Escrow   Liability     credit   OK
--   USMCA   escrow/escrow  2100 Driver Escrow - Held in Trust       Liability     debit    WRONG
--
-- Driver escrow is a LIABILITY (locked decision `driver-escrow-is-liability`; 00_LOCKED_DECISIONS §9.4
-- "Every escrow draw debits the Driver Escrow liability" — a draw debits, therefore a WITHHOLDING
-- credits). Both other entities agree. USMCA is the outlier and it is wrong.
--
-- ROOT CAUSE — not a stray data edit. The USMCA seed migration
-- 202611190000_usmca_expense_category_map_and_driver_subaccount_numbering.sql builds all 16 mappings
-- from one VALUES list and then inserts a CONSTANT side:
--     SELECT v_opco, r.kind, r.code, v_acct, 'debit', true
-- The TRANSP/TRK seeds carry a per-row posting_side; that one flattened it. Every row in that list is
-- debit-normal EXCEPT escrow (Liability), so escrow — and only escrow — came out inverted. That
-- migration is already applied on prod and is NEVER edited (checksum freeze); this is the forward fix,
-- so a fresh database (seed then correct) and prod (correct in place) converge on the same state.
--
-- BLAST RADIUS — honest: this is NOT producing a wrong journal entry today. Every consumer of
-- resolveAccountForCategory() (posting-engine cash-advance x2, fuel-posting, maintenance-posting,
-- bill-account-resolver, invoice-line-revenue-resolution, bank-feed-gl-posting, cash-advance-requests)
-- reads ONLY .account_id; each poster hardcodes its own DR/CR. `posting_side` is stored, returned by
-- the resolver, and surfaced to humans through the map CRUD API and the cash-advance preview, but no
-- poster derives a side from it. So the harm today is wrong data shown to operators, and a loaded gun
-- for the first poster that honors the field. Correcting the data defuses it either way.
--
-- IDEMPOTENT: keyed by (operating_company_id, category_kind, category_code); re-running matches zero
-- rows. Dynamic org.companies resolution — a hardcoded UUID FK-fails on a fresh-from-0001 CI database
-- that seeds gen_random_uuid() companies. No DELETE (void-not-delete); this corrects an attribute.

DO $$
DECLARE
  v_opco uuid;
  v_fixed integer := 0;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA' LIMIT 1;

  IF v_opco IS NULL THEN
    RAISE NOTICE 'ACCT-F99: no USMCA company on this database — nothing to correct';
    RETURN;
  END IF;

  UPDATE accounting.expense_category_account_map m
     SET posting_side = 'credit',
         updated_at   = now()
   WHERE m.operating_company_id = v_opco
     AND m.category_kind        = 'escrow'
     AND m.category_code        = 'escrow'
     AND m.posting_side         = 'debit';

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'ACCT-F99: corrected % USMCA escrow mapping row(s) debit -> credit', v_fixed;
END $$;
