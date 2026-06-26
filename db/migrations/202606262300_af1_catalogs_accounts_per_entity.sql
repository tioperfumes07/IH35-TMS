-- [HOLD-FOR-JORGE — TIER 1] AF-1 — catalogs.accounts per-entity (entity-COA) migration
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip any posting flag. ***
-- This migration is BUILT-SOLO-AND-HELD for the Tier-1 ceremony: it RUNS on a Neon branch executed by
-- Jorge/GUARD (the coder is §1.5-gated from self-connecting to Neon/prod). The PR body carries the exact
-- V1-V5 validation SQL GUARD runs on the branch before any sign-off. catalogs.accounts is GLOBAL today
-- (operating_company_id nullable + 2 global UNIQUEs) which violates entity independence (TRK/TRANSP/USMCA
-- share nothing). AF-1 makes the chart of accounts per-entity — the keystone the financial posting flags
-- depend on. QBO stays system of record; this migration POSTS NOTHING.
--
-- GUARD-VERIFIED LIVE PROD FACTS this is built to:
--   * catalogs.accounts.operating_company_id exists but is_nullable=YES (exists-but-unenforced).
--   * 2 global UNIQUEs: accounts_account_number_key(account_number), accounts_qbo_account_id_key(qbo_account_id).
--   * 26 live FK constraints reference catalogs.accounts(id) (3 banking conditionals not on prod — handled
--     idempotently if present). 8 FK columns are NOT NULL (load-bearing) — re-keyed first.
--   * Row overlap 50/50 across entities (shared namespace) → backfill MUST split shared rows per entity.
--   * Entities: TRANSP 91e0bf0a-133f-4ce8-a734-2586cfa66d96 (operating, QBO), TRK b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e,
--     USMCA 5c854333-6ea5-4faa-af31-67cb272fef80 (hidden until 2026-07).
--
-- ⚠️ BRANCH-TEST PREREQUISITES / OPEN QUESTIONS (GUARD must confirm on the Neon branch BEFORE sign-off):
--   (Q1) OWNERSHIP RULE for backfilling operating_company_id is derived from the existing per-entity mapping
--        layer: accounting.chart_of_accounts_roles + accounting.expense_category_account_map (which already
--        bind (entity → account)), then account_number prefix ('TRK'→TRK, 'USMCA'→USMCA), else default TRANSP
--        (the active QBO-connected operating carrier). GUARD must confirm this matches the intended per-entity
--        ownership against live rows; V1 (id_overlap=0) is the proof. The 3 commingled control accounts
--        (ar_control / ap_control / undeposited_funds shared TRANSP+TRK per COA-ENTITY-SEPARATION DESIGN-C)
--        are split here.
--   (Q2) catalogs.items / catalogs.posting_templates / catalogs.account_role_bindings have NO entity column
--        (global catalog config). Their account FKs are re-keyed to the TRANSP copy by default (TRANSP is the
--        only QBO-posting entity today). If these catalogs must become per-entity too, that is a follow-up —
--        flagged, NOT silently resolved. (account_role_bindings overlaps the chart_of_accounts_roles mapping;
--        confirm which is authoritative.)
--   (Q3) bill_lines / invoice_lines / expense_lines have NO direct operating_company_id — entity is derived
--        from the parent (accounting.bills / accounting.invoices / accounting.expenses .operating_company_id).
--        Confirmed via the bill-expense-lines RLS model; GUARD re-confirms on branch.
--
-- Idempotent (guarded), atomic per migration run, self-contained GRANTs. CI fresh-DB validates from-migrations.

DO $$
DECLARE
  v_transp uuid := '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
  v_trk    uuid := 'b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e';
  v_usmca  uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
BEGIN
  -- Guard: only run the data migration while catalogs.accounts is still global (operating_company_id nullable).
  -- Once NOT NULL + composite uniques exist this is a no-op (idempotent replay / fresh-DB safe).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='catalogs' AND table_name='accounts' AND column_name='operating_company_id'
  ) THEN
    RAISE NOTICE 'AF-1: catalogs.accounts.operating_company_id absent (fresh DB) — adding nullable first';
    ALTER TABLE catalogs.accounts ADD COLUMN operating_company_id uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='catalogs' AND table_name='accounts'
      AND column_name='operating_company_id' AND is_nullable='YES'
  ) THEN

    -- ── STEP 1: build the per-entity ownership + split map ──────────────────────────────────────────────
    -- account_entity_map(old_id, entity_id, new_id): for each (account, owning-entity), the resolved account id.
    -- The PRIMARY owning entity keeps the original id; each ADDITIONAL owning entity gets a fresh copy id.
    CREATE TEMP TABLE _af1_owners ON COMMIT DROP AS
      -- owners from the per-entity mapping layer (authoritative bindings)
      SELECT account_id AS old_id, operating_company_id AS entity_id
        FROM accounting.chart_of_accounts_roles WHERE account_id IS NOT NULL
      UNION
      SELECT account_id, operating_company_id
        FROM accounting.expense_category_account_map WHERE account_id IS NOT NULL;

    -- accounts with NO mapping-layer owner: assign by account_number prefix, else default TRANSP
    INSERT INTO _af1_owners (old_id, entity_id)
    SELECT a.id,
           CASE
             WHEN a.account_number ILIKE 'TRK%'   THEN v_trk
             WHEN a.account_number ILIKE 'USMCA%' THEN v_usmca
             ELSE v_transp
           END
    FROM catalogs.accounts a
    WHERE NOT EXISTS (SELECT 1 FROM _af1_owners o WHERE o.old_id = a.id);

    -- rank owners per account so the PRIMARY (TRANSP > TRK > USMCA) keeps the original id
    CREATE TEMP TABLE _af1_map ON COMMIT DROP AS
    WITH ranked AS (
      SELECT DISTINCT old_id, entity_id,
             row_number() OVER (
               PARTITION BY old_id
               ORDER BY (CASE entity_id WHEN '91e0bf0a-133f-4ce8-a734-2586cfa66d96' THEN 0
                                        WHEN 'b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e' THEN 1 ELSE 2 END)
             ) AS rn
      FROM _af1_owners
    )
    SELECT old_id, entity_id, rn,
           CASE WHEN rn = 1 THEN old_id ELSE gen_random_uuid() END AS new_id
    FROM ranked;

    -- ── STEP 2a: backfill operating_company_id on the PRIMARY (original) rows ───────────────────────────
    UPDATE catalogs.accounts a
       SET operating_company_id = m.entity_id
      FROM _af1_map m
     WHERE m.old_id = a.id AND m.rn = 1;

    -- ── STEP 2b: SPLIT — insert per-entity COPIES for the additional owning entities (rn > 1) ───────────
    -- Copy every account column; new id; new operating_company_id. (Column list explicit per 0010 schema.)
    INSERT INTO catalogs.accounts
      (id, operating_company_id, account_number, account_name, account_type, account_subtype,
       parent_account_id, qbo_account_id, qbo_account_qrn, is_postable, currency_code,
       opening_balance_cents, notes, created_at, updated_at, deactivated_at,
       created_by_user_id, updated_by_user_id, qbo_synced_at, qbo_sync_status, qbo_sync_error,
       is_locked, opening_balance_as_of)
    SELECT m.new_id, m.entity_id, a.account_number, a.account_name, a.account_type, a.account_subtype,
           a.parent_account_id, a.qbo_account_id, a.qbo_account_qrn, a.is_postable, a.currency_code,
           a.opening_balance_cents, a.notes, a.created_at, now(), a.deactivated_at,
           a.created_by_user_id, a.updated_by_user_id, a.qbo_synced_at, a.qbo_sync_status, a.qbo_sync_error,
           a.is_locked, a.opening_balance_as_of
    FROM _af1_map m JOIN catalogs.accounts a ON a.id = m.old_id
    WHERE m.rn > 1;

    -- ── STEP 3: RE-KEY the 26 live FK columns → each child points to ITS OWN entity's account copy ──────
    -- Helper expr: resolved(old_id, entity) = _af1_map.new_id WHERE old_id+entity_id match (else unchanged).
    -- 3.1 — 8 NOT NULL (load-bearing) FK columns FIRST, by the child's own operating_company_id:
    UPDATE accounting.journal_entry_postings c SET account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE accounting.banking_rules c SET then_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.then_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE accounting.expense_category_account_map c SET account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE accounting.chart_of_accounts_roles c SET account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE accounting.escrow_accounts c SET coa_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.coa_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE payroll.driver_settlement_line_items c SET posting_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.posting_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    -- catalogs.posting_templates (no entity col → Q2: default to TRANSP copy)
    UPDATE catalogs.posting_templates c SET debit_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.debit_account_id AND m.entity_id=v_transp AND m.rn>1;
    UPDATE catalogs.posting_templates c SET credit_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.credit_account_id AND m.entity_id=v_transp AND m.rn>1;
    UPDATE catalogs.account_role_bindings c SET account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.account_id AND m.entity_id=v_transp AND m.rn>1;  -- Q2

    -- 3.2 — nullable FK columns:
    UPDATE accounting.bill_lines c SET account_id = m.new_id
      FROM _af1_map m, accounting.bills b
      WHERE b.id=c.bill_id AND m.old_id=c.account_id AND m.entity_id=b.operating_company_id AND m.rn>1; -- Q3
    UPDATE accounting.invoice_lines c SET account_id = m.new_id
      FROM _af1_map m, accounting.invoices i
      WHERE i.id=c.invoice_id AND m.old_id=c.account_id AND m.entity_id=i.operating_company_id AND m.rn>1; -- Q3
    UPDATE accounting.expense_lines c SET expense_account_uuid = m.new_id
      FROM _af1_map m, accounting.expenses e
      WHERE e.id=c.expense_id AND m.old_id=c.expense_account_uuid AND m.entity_id=e.operating_company_id AND m.rn>1; -- Q3
    UPDATE accounting.bill_payments c SET cc_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.cc_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE banking.bank_transactions c SET suggested_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.suggested_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE catalogs.items c SET default_income_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.default_income_account_id AND m.entity_id=v_transp AND m.rn>1;  -- Q2
    UPDATE catalogs.items c SET default_expense_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.default_expense_account_id AND m.entity_id=v_transp AND m.rn>1; -- Q2
    UPDATE catalogs.accounts c SET parent_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.parent_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.asset_classes c SET default_asset_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.default_asset_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.asset_classes c SET default_accum_depr_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.default_accum_depr_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.asset_classes c SET default_depr_expense_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.default_depr_expense_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.assets c SET asset_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.asset_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.assets c SET accum_depr_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.accum_depr_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE fixed_assets.assets c SET depr_expense_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.depr_expense_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE finance.loans c SET gl_liability_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.gl_liability_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE finance.loans c SET gl_interest_expense_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.gl_interest_expense_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    UPDATE finance.loans c SET payment_account_id = m.new_id
      FROM _af1_map m WHERE m.old_id=c.payment_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;

    -- 3.3 — banking conditional FKs (NOT on prod per GUARD; re-key idempotently IF the constraint/col exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='banking' AND table_name='transaction_categories' AND column_name='coa_account_id') THEN
      UPDATE banking.transaction_categories c SET coa_account_id = m.new_id
        FROM _af1_map m WHERE m.old_id=c.coa_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='banking' AND table_name='bank_transactions' AND column_name='coa_account_id') THEN
      UPDATE banking.bank_transactions c SET coa_account_id = m.new_id
        FROM _af1_map m WHERE m.old_id=c.coa_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='banking' AND table_name='bank_accounts' AND column_name='ledger_account_id') THEN
      UPDATE banking.bank_accounts c SET ledger_account_id = m.new_id
        FROM _af1_map m WHERE m.old_id=c.ledger_account_id AND m.entity_id=c.operating_company_id AND m.rn>1;
    END IF;

    -- ── STEP 4: enforce NOT NULL on operating_company_id ───────────────────────────────────────────────
    ALTER TABLE catalogs.accounts ALTER COLUMN operating_company_id SET NOT NULL;
    ALTER TABLE catalogs.accounts
      ADD CONSTRAINT accounts_operating_company_fk
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;

-- ── STEP 5: swap global UNIQUEs → per-entity composite UNIQUEs (idempotent) ───────────────────────────
ALTER TABLE catalogs.accounts DROP CONSTRAINT IF EXISTS accounts_account_number_key;
ALTER TABLE catalogs.accounts DROP CONSTRAINT IF EXISTS accounts_qbo_account_id_key;
DROP INDEX IF EXISTS catalogs.idx_catalogs_accounts_account_number;
DROP INDEX IF EXISTS catalogs.idx_catalogs_accounts_qbo_account_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_company_account_number
  ON catalogs.accounts (operating_company_id, account_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_company_qbo_account_id
  ON catalogs.accounts (operating_company_id, qbo_account_id)
  WHERE qbo_account_id IS NOT NULL;

-- ── STEP 6: entity-scoped RLS (currently NONE — role-only) ─────────────────────────────────────────────
ALTER TABLE catalogs.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_entity_select ON catalogs.accounts;
CREATE POLICY accounts_entity_select ON catalogs.accounts FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
DROP POLICY IF EXISTS accounts_entity_write ON catalogs.accounts;
CREATE POLICY accounts_entity_write ON catalogs.accounts FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── STEP 7: self-contained GRANTs (Standing Order #16) ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ih35_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.accounts TO ih35_app;
  END IF;
END $$;
