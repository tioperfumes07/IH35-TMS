-- [HOLD-FOR-JORGE — TIER 1] AF-2 — catalogs.items per-entity (entity item master)
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** Runs on a Neon branch (GUARD/Jorge execute; coder is Neon-gated).
-- POSTS NOTHING. Idempotent (guarded), atomic per run, self-contained GRANTs. CI fresh-DB validates.
-- GUARD-verified live facts are in the block doc / PR body. Sibling of AF-1 (catalogs.accounts per-entity).

DO $$
DECLARE v_transp uuid; v_trk uuid; v_usmca uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code='TRANSP' LIMIT 1;
  SELECT id INTO v_trk    FROM org.companies WHERE code='TRK'    LIMIT 1;
  SELECT id INTO v_usmca  FROM org.companies WHERE code='USMCA'  LIMIT 1;

  -- add operating_company_id (nullable first) + FK to org.companies, if absent (fresh DB / prod pre-AF-2)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='items' AND column_name='operating_company_id') THEN
    ALTER TABLE catalogs.items ADD COLUMN operating_company_id uuid;
    ALTER TABLE catalogs.items ADD CONSTRAINT items_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
    RAISE NOTICE 'AF-2: catalogs.items.operating_company_id added (nullable)';
  END IF;

  -- backfill runs ONLY while still nullable AND TRANSP exists (the sole owner)
  IF v_transp IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='items'
        AND column_name='operating_company_id' AND is_nullable='YES') THEN
    -- OWNERSHIP (GUARD-verified): every existing item → TRANSP. No operating_company_id ever existed;
    -- 0 TRK/USMCA-prefixed rows; no per-entity item binding layer; TRANSP is the only QBO/posting entity;
    -- 179 qbo rows are TRANSP's projection + 5 generic carrier seeds. No split/copies (unlike AF-1 accounts).
    UPDATE catalogs.items SET operating_company_id = v_transp WHERE operating_company_id IS NULL;

    -- FAIL LOUD: no item may reference a DIFFERENT entity's account (trivially 0 today; guards replay/fresh-DB)
    IF EXISTS (
      SELECT 1 FROM catalogs.items i JOIN catalogs.accounts a ON a.id=i.default_income_account_id
        WHERE a.operating_company_id <> i.operating_company_id
      UNION ALL
      SELECT 1 FROM catalogs.items i JOIN catalogs.accounts a ON a.id=i.default_expense_account_id
        WHERE a.operating_company_id <> i.operating_company_id
    ) THEN
      RAISE EXCEPTION 'AF-2 V1: item references a cross-entity account — explicit per-entity mapping required (do not guess).';
    END IF;

    ALTER TABLE catalogs.items ALTER COLUMN operating_company_id SET NOT NULL;
  END IF;
END $$;

-- ── per-entity composite uniques (replace the 3 global uniques) ─────────────────────────────
ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_item_name_key;
ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_item_code_key;
ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_qbo_item_id_key;
DROP INDEX IF EXISTS catalogs.items_item_name_key;
DROP INDEX IF EXISTS catalogs.items_item_code_key;
DROP INDEX IF EXISTS catalogs.items_qbo_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_item_name
  ON catalogs.items (operating_company_id, item_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_item_code
  ON catalogs.items (operating_company_id, item_code) WHERE item_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_qbo_item_id
  ON catalogs.items (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL;

-- ── linkage hardening: same-entity composite FKs for income/expense account refs (class → AF-3) ─
DO $$
BEGIN
  ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_default_income_account_id_fkey;
  ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_default_expense_account_id_fkey;
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='accounts' AND column_name='operating_company_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_accounts_company_id' AND conrelid='catalogs.accounts'::regclass) THEN
      ALTER TABLE catalogs.accounts ADD CONSTRAINT uq_accounts_company_id UNIQUE (operating_company_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_income_account_same_entity_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_income_account_same_entity_fkey
        FOREIGN KEY (operating_company_id, default_income_account_id)
        REFERENCES catalogs.accounts (operating_company_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_expense_account_same_entity_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_expense_account_same_entity_fkey
        FOREIGN KEY (operating_company_id, default_expense_account_id)
        REFERENCES catalogs.accounts (operating_company_id, id);
    END IF;
  ELSE
    -- accounts not yet per-entity (should not happen post-AF-1): keep single-col FKs so items keep integrity
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_default_income_account_id_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_default_income_account_id_fkey
        FOREIGN KEY (default_income_account_id) REFERENCES catalogs.accounts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_default_expense_account_id_fkey' AND conrelid='catalogs.items'::regclass) THEN
      ALTER TABLE catalogs.items ADD CONSTRAINT items_default_expense_account_id_fkey
        FOREIGN KEY (default_expense_account_id) REFERENCES catalogs.accounts(id);
    END IF;
  END IF;
END $$;
-- default_class_id stays single-col FK → catalogs.classes(id) until AF-3 scopes catalogs.classes (FLAG-CLASSES).

-- ── entity-scoped RLS (replaces role-only policies; write-role gate PRESERVED + entity isolation added) ─
ALTER TABLE catalogs.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS items_select ON catalogs.items;
DROP POLICY IF EXISTS items_insert ON catalogs.items;
DROP POLICY IF EXISTS items_update ON catalogs.items;
DROP POLICY IF EXISTS items_entity_select ON catalogs.items;
DROP POLICY IF EXISTS items_entity_write ON catalogs.items;
CREATE POLICY items_entity_select ON catalogs.items FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY items_entity_write ON catalogs.items FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])));

-- ── self-contained GRANTs (Standing Order #16) ─────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ih35_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.items TO ih35_app;
  END IF;
END $$;
