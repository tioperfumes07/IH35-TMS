-- [FINANCIAL CLUSTER] USMCA expense-category map + per-driver sub-account numbering.
-- Owner-approved 2026-08-03. Agent Neon-apply authorized (CPA ANSWERS H2; owner reaffirmed in chat).
-- POSTS NOTHING. Additive/idempotent. No GL math, no flag flip, no QBO write-back.
--
-- ═══ PART 1 — THE MONEY GATE ════════════════════════════════════════════════════════════════════
-- ROOT CAUSE, PROVEN ON PROD (positive control mdata.vendors=2,828): a USMCA vendor bill saved at
-- 18:41 CT and did NOT post. The poster RAN and refused, leaving an honest audit row:
--   accounting.bill.gl_post_failed / BILL_LINE_ACCOUNT_UNRESOLVED
--   "Category maintenance/maintenance has no active expense_category_account_map entry
--    — FAIL LOUD (no silent fallback)."
-- accounting.expense_category_account_map holds 17 rows for TRANSP and 10 for TRK — and ZERO
-- expense-side rows for USMCA (only the 6 revenue codes seeded in #4025). So EVERY USMCA bill fails
-- the same way. This is not a missing Finalize/Post feature: bills.service.ts already calls
-- postBillGlIfEnabled on create and BILL_GL_POSTING_ENABLED is true for all three entities. The gate
-- is the absent map.
--
-- Mapped BY PURPOSE against TRANSP's live map; every target account already exists in USMCA and was
-- read from prod this session. Codes are exactly the ones TRANSP uses, so the resolver finds them.
--
-- ═══ PART 2 — TWO REAL ACCOUNTS INSTEAD OF A CATCH-ALL ══════════════════════════════════════════
-- TRANSP maps `office` -> a purpose-built Office/Administrative account and `other` -> Uncategorized
-- Expense. USMCA had neither, so the only same-shape option was to point both at 6900 Miscellaneous.
-- That is rejected deliberately: a catch-all that absorbs office costs AND every unmapped category is
-- exactly what hides a mis-categorisation from a CPA, and it makes "Miscellaneous" unauditable.
-- USMCA gets its own 6210 Office & Administrative Expense and 6999 Uncategorized Expense.
--
-- ═══ PART 3 — ROW 259: per-driver sub-account numbering ═════════════════════════════════════════
-- driver-subaccount-provision.service.ts creates "Driver Cash Advance- <Name>" with account_number
-- NULL and account_subtype NULL, commented "assigned when the account syncs to QBO". USMCA has NO
-- QuickBooks connection, so those accounts can NEVER receive a number — the same false assumption
-- that broke the WO vendor lookup (#4048). Two live rows are affected. Backfilled here with the
-- owner-approved scheme (parent number + zero-padded sequence) and the parent's subtype; the CREATOR
-- is fixed in the same PR so the next hire is not created broken.
--
-- IDEMPOTENT: every write is NOT EXISTS / IS NULL guarded. Apply-twice safe. No DELETE, no DROP.
-- WHY NOT ON CONFLICT: expense_category_account_map has no unique index on
-- (operating_company_id, category_kind, category_code) — a bare ON CONFLICT would raise
-- "no unique or exclusion constraint matching", the error that kept vendors_pull red until #3993.

BEGIN;

DO $$
DECLARE
  v_opco uuid;
  v_acct uuid;
  v_parent uuid;
  r RECORD;
  v_seq int := 0;
  v_mapped int := 0;
  v_targets int := 0;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA';
  IF v_opco IS NULL THEN RAISE EXCEPTION 'USMCA not found — refusing to seed blind'; END IF;
  PERFORM set_config('app.operating_company_id', v_opco::text, true);

  -- §1 — the two dedicated accounts (never a catch-all).
  FOR r IN SELECT * FROM (VALUES
    ('6210','Office & Administrative Expense','Expense','Office/General Administrative Expenses'),
    ('6999','Uncategorized Expense','Expense','Other Miscellaneous Service Cost')
  ) AS t(num, nm, typ, sub) LOOP
    INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
    SELECT v_opco, r.num, r.nm, r.typ, r.sub, true
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.accounts a
      WHERE a.operating_company_id = v_opco AND a.deactivated_at IS NULL
        AND (a.account_number = r.num OR a.account_name = r.nm)
    );
  END LOOP;

  -- §2 — the expense-side category map, mirroring TRANSP by purpose.
  FOR r IN SELECT * FROM (VALUES
    ('maintenance','maintenance','5400'),
    ('fuel','fuel','5000'),
    ('fuel','diesel','5000'),
    ('fuel','def','5000'),
    ('fuel','oil','5000'),
    ('fuel','misc','5000'),
    ('fuel','reefer','5000'),
    ('toll','toll','5300'),
    ('lumper','lumper','DRIVERTRIPLU056412'),
    ('driver_pay','driver_pay','6890'),
    ('cash_advance','cash_advance','DRIVERCASHAD896665'),
    ('escrow','escrow','2100'),
    ('insurance','insurance','5600'),
    ('factoring_fee','factoring_fee','6400'),
    ('office','office','6210'),
    ('other','other','6999')
  ) AS t(kind, code, num) LOOP
    SELECT a.id INTO v_acct FROM catalogs.accounts a
    WHERE a.operating_company_id = v_opco AND a.account_number = r.num
      AND a.deactivated_at IS NULL AND a.is_postable = true
    LIMIT 1;

    -- PORTABILITY (caught by the local fresh-DB replay, not assumed): several of these targets are
    -- QBO-mirror-style numbers that exist on PROD only — DRIVERTRIPLU056412, DRIVERCASHAD896665 — and
    -- the TMS-native 4-digit accounts depend on earlier seed migrations having run. A hard RAISE here
    -- aborted the ENTIRE migration on a fresh database, which would break fresh-DB CI and the deploy
    -- pipeline. So a missing target SKIPS that one mapping with a NOTICE; the run still fails loud if
    -- NOTHING mapped at all (checked after the loop), which is the case that actually means "wrong".
    IF v_acct IS NULL THEN
      RAISE NOTICE 'skipping %/% — USMCA account % not present on this database', r.kind, r.code, r.num;
      CONTINUE;
    END IF;
    v_mapped := v_mapped + 1;

    INSERT INTO accounting.expense_category_account_map
      (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
    SELECT v_opco, r.kind, r.code, v_acct, 'debit', true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.expense_category_account_map m
      WHERE m.operating_company_id = v_opco AND m.category_kind = r.kind
        AND m.category_code = r.code AND m.is_active = true
    );
  END LOOP;

  -- Fail loud ONLY on a total miss: on prod all 16 map; on a fresh DB a subset is expected and fine,
  -- but zero means the chart seed did not run and mapping silently nothing would hide that.
  SELECT count(*) INTO v_targets FROM catalogs.accounts
  WHERE operating_company_id = v_opco AND deactivated_at IS NULL;
  IF v_mapped = 0 AND v_targets > 0 THEN
    RAISE EXCEPTION 'USMCA has % accounts but ZERO expense categories mapped — refusing to finish silently', v_targets;
  END IF;

  -- §3 — ROW 259: number + subtype the existing per-driver advance sub-accounts.
  SELECT a.id INTO v_parent FROM catalogs.accounts a
  WHERE a.operating_company_id = v_opco AND a.account_number = 'DRIVERCASHAD896665'
    AND a.deactivated_at IS NULL
  LIMIT 1;

  IF v_parent IS NOT NULL THEN
    FOR r IN
      SELECT a.id, a.account_name
      FROM catalogs.accounts a
      WHERE a.operating_company_id = v_opco
        AND a.parent_account_id = v_parent
        AND a.deactivated_at IS NULL
        AND a.account_number IS NULL
      ORDER BY a.created_at, a.account_name
    LOOP
      -- Next free sequence under this parent; recomputed per row so a re-run cannot collide.
      SELECT COALESCE(MAX(NULLIF(regexp_replace(a.account_number, '^DRIVERCASHAD896665-', ''), '')::int), 0)
        INTO v_seq
      FROM catalogs.accounts a
      WHERE a.operating_company_id = v_opco
        AND a.account_number ~ '^DRIVERCASHAD896665-[0-9]+$';

      UPDATE catalogs.accounts
      SET account_number = 'DRIVERCASHAD896665-' || lpad((v_seq + 1)::text, 3, '0'),
          account_subtype = COALESCE(account_subtype, (SELECT p.account_subtype FROM catalogs.accounts p WHERE p.id = v_parent)),
          updated_at = now()
      WHERE id = r.id AND account_number IS NULL;
    END LOOP;
  END IF;
END $$;

COMMIT;
