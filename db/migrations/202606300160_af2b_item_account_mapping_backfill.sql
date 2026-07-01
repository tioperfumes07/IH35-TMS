-- [HOLD-FOR-JORGE — TIER 1] AF-2b — item -> income/expense account mapping backfill (TEMPLATE)
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** Runs on a Neon branch (GUARD/Jorge execute; coder is Neon-gated).
-- POSTS NOTHING. Only sets catalogs.items.default_income_account_id / default_expense_account_id.
-- Requires AF-2 (202606300080) merged: catalogs.items.operating_company_id + composite same-entity FKs.
--
-- ┌──────────────────────────────────────────────────────────────────────────────────────────┐
-- │ POPULATE FROM THE APPROVED CSV BEFORE RUNNING.                                             │
-- │ The mapping is NOT derivable from item names. It comes from each QBO Item's                │
-- │ IncomeAccountRef / ExpenseAccountRef, resolved by scripts/af2b-item-account-map.mjs into   │
-- │ docs/recon/af2b-item-account-map-<date>.csv, then reviewed by Jorge/CPA.                    │
-- │ Ceremony: run loader -> CSV -> Jorge/CPA review -> paste ONLY approved rows (rows that have │
-- │ a resolved uuid) into the VALUES block below -> [HOLD] PR -> JORGE-APPROVED -> GUARD branch │
-- │ test V1/V2 -> merge -> prod-verify.                                                        │
-- │ As shipped the VALUES block is EMPTY -> this migration is a NO-OP on a fresh DB (CI-safe).  │
-- │ Items with no QBO account ref stay NULL. The AF-2 composite same-entity FK rejects any     │
-- │ cross-entity uuid at the DB, so a bad CSV row fails here, not silently.                     │
-- └──────────────────────────────────────────────────────────────────────────────────────────┘

DO $$
DECLARE
  v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'AF-2b: TRANSP not present — nothing to map. Skipping.';
    RETURN;
  END IF;

  -- Guard: AF-2 must have made catalogs.items per-entity before this backfill can run safely.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'catalogs' AND table_name = 'items'
       AND column_name = 'operating_company_id'
  ) THEN
    RAISE EXCEPTION 'AF-2b requires AF-2 (catalogs.items.operating_company_id) — run 202606300080 first.';
  END IF;

  -- ── APPROVED MAPPING ROWS (from docs/recon/af2b-item-account-map-<date>.csv) ──────────────
  -- Format per row: ('<qbo_item_id>', '<income_uuid>'::uuid, '<expense_uuid>'::uuid)
  -- Use NULL for a side with no resolved account. Paste ONLY reviewer-approved rows.
  -- Leaving the VALUES list empty makes this a guaranteed no-op (fresh DB / pre-approval).
  UPDATE catalogs.items i
     SET default_income_account_id  = m.income_uuid,
         default_expense_account_id = m.expense_uuid,
         updated_at = now()
    FROM (
      VALUES
        -- ('130', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
        -- ('131', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, NULL::uuid),
        (NULL::text, NULL::uuid, NULL::uuid)   -- sentinel: keeps VALUES valid + WHERE below drops it
    ) AS m(qbo_item_id, income_uuid, expense_uuid)
   WHERE m.qbo_item_id IS NOT NULL           -- drops the sentinel; only real rows apply
     AND i.qbo_item_id = m.qbo_item_id
     AND i.operating_company_id = v_transp;

  -- V2 guard (in-migration): every account we just set must be TRANSP + correct type.
  -- (The composite same-entity FK already enforces same-entity; this also enforces the type set.)
  IF EXISTS (
    SELECT 1 FROM catalogs.items i
      JOIN catalogs.accounts a ON a.id = i.default_income_account_id
     WHERE i.operating_company_id = v_transp
       AND (a.operating_company_id <> i.operating_company_id
            OR a.account_type NOT IN ('Income', 'OtherIncome'))
  ) THEN
    RAISE EXCEPTION 'AF-2b V2: an item income account is cross-entity or wrong type (expected Income/OtherIncome).';
  END IF;
  IF EXISTS (
    SELECT 1 FROM catalogs.items i
      JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
     WHERE i.operating_company_id = v_transp
       AND (a.operating_company_id <> i.operating_company_id
            OR a.account_type NOT IN ('Expense', 'CostOfGoodsSold', 'OtherExpense'))
  ) THEN
    RAISE EXCEPTION 'AF-2b V2: an item expense account is cross-entity or wrong type (expected Expense/COGS/OtherExpense).';
  END IF;
END $$;
