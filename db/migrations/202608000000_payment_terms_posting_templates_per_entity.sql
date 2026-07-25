-- 202608000000_payment_terms_posting_templates_per_entity.sql
--
-- HELD — DO NOT RUN ON PROD. Owner Neon-applies + ledger-backfills. Registered in .held-migrations.json.
--
-- LST-F03 — catalogs.payment_terms and catalogs.posting_templates are entity-blind (no
-- operating_company_id). Prod lucia 2026-07-25: payment_terms=5 rows, posting_templates=0.
-- Convert to per-entity (same-values seed across active entities). NEVER-DELETE (§F.24).
-- Dynamic org.companies — NO hardcoded UUID.

BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

DO $mig$
DECLARE
  v_primary uuid;
  v_seed uuid;
BEGIN
  SELECT id INTO v_primary
    FROM org.companies
   WHERE deactivated_at IS NULL AND code = 'TRANSP'
   ORDER BY created_at, id LIMIT 1;
  IF v_primary IS NULL THEN
    SELECT id INTO v_primary
      FROM org.companies WHERE deactivated_at IS NULL
     ORDER BY created_at, id LIMIT 1;
  END IF;
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'payment_terms_posting_templates_per_entity: no active org.companies';
  END IF;

  -- ===== payment_terms =====
  ALTER TABLE catalogs.payment_terms ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.payment_terms SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  ALTER TABLE catalogs.payment_terms ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_terms_opco_fk'
  ) THEN
    ALTER TABLE catalogs.payment_terms
      ADD CONSTRAINT payment_terms_opco_fk
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.payment_terms DROP CONSTRAINT IF EXISTS payment_terms_terms_name_key;
  -- qbo_terms_id stays globally unique when non-null is OK for mirror keys; keep as-is.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_terms_opco_terms_name_key'
  ) THEN
    ALTER TABLE catalogs.payment_terms
      ADD CONSTRAINT payment_terms_opco_terms_name_key
      UNIQUE (operating_company_id, terms_name);
  END IF;

  FOR v_seed IN
    SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary
  LOOP
    INSERT INTO catalogs.payment_terms (
      operating_company_id, terms_name, days_until_due,
      early_payment_discount_pct, early_payment_discount_days,
      qbo_terms_id, notes, deactivated_at, created_by_user_id, updated_by_user_id
    )
    SELECT
      v_seed, terms_name, days_until_due,
      early_payment_discount_pct, early_payment_discount_days,
      NULL, -- do not duplicate qbo_terms_id UNIQUE across entities
      notes, deactivated_at, created_by_user_id, updated_by_user_id
    FROM catalogs.payment_terms
    WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, terms_name) DO NOTHING;
  END LOOP;

  ALTER TABLE catalogs.payment_terms ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.payment_terms FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.payment_terms;
  -- Drop legacy role policies if present (names vary); company_scope is the go-forward.
  DROP POLICY IF EXISTS payment_terms_select ON catalogs.payment_terms;
  DROP POLICY IF EXISTS payment_terms_insert ON catalogs.payment_terms;
  DROP POLICY IF EXISTS payment_terms_update ON catalogs.payment_terms;
  DROP POLICY IF EXISTS payment_terms_tenant_scope ON catalogs.payment_terms;
  CREATE POLICY company_scope ON catalogs.payment_terms
    FOR ALL
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );
  REVOKE DELETE ON catalogs.payment_terms FROM ih35_app;
  GRANT SELECT, INSERT, UPDATE ON catalogs.payment_terms TO ih35_app;

  -- ===== posting_templates =====
  ALTER TABLE catalogs.posting_templates ADD COLUMN IF NOT EXISTS operating_company_id uuid;
  UPDATE catalogs.posting_templates SET operating_company_id = v_primary WHERE operating_company_id IS NULL;
  -- Table may be empty — still lock NOT NULL for future inserts.
  ALTER TABLE catalogs.posting_templates ALTER COLUMN operating_company_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posting_templates_opco_fk'
  ) THEN
    ALTER TABLE catalogs.posting_templates
      ADD CONSTRAINT posting_templates_opco_fk
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  ALTER TABLE catalogs.posting_templates DROP CONSTRAINT IF EXISTS posting_templates_template_code_key;
  ALTER TABLE catalogs.posting_templates DROP CONSTRAINT IF EXISTS posting_templates_template_name_key;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posting_templates_opco_code_key'
  ) THEN
    ALTER TABLE catalogs.posting_templates
      ADD CONSTRAINT posting_templates_opco_code_key
      UNIQUE (operating_company_id, template_code);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posting_templates_opco_name_key'
  ) THEN
    ALTER TABLE catalogs.posting_templates
      ADD CONSTRAINT posting_templates_opco_name_key
      UNIQUE (operating_company_id, template_name);
  END IF;

  -- Seed copies only when primary has rows AND matching same-entity debit/credit accounts exist.
  -- With 0 rows on prod this loop is a no-op (owner seeds templates later).
  FOR v_seed IN
    SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary
  LOOP
    INSERT INTO catalogs.posting_templates (
      operating_company_id, template_name, template_code, description,
      debit_account_id, credit_account_id, default_class_id, default_memo,
      is_active, deactivated_at, created_by_user_id, updated_by_user_id
    )
    SELECT
      v_seed, src.template_name, src.template_code, src.description,
      deb.id, cred.id, NULL, src.default_memo,
      src.is_active, src.deactivated_at, src.created_by_user_id, src.updated_by_user_id
    FROM catalogs.posting_templates src
    JOIN catalogs.accounts deb_src ON deb_src.id = src.debit_account_id
    JOIN catalogs.accounts cred_src ON cred_src.id = src.credit_account_id
    JOIN catalogs.accounts deb
      ON deb.operating_company_id = v_seed
     AND deb.account_number IS NOT DISTINCT FROM deb_src.account_number
     AND deb.deactivated_at IS NULL
    JOIN catalogs.accounts cred
      ON cred.operating_company_id = v_seed
     AND cred.account_number IS NOT DISTINCT FROM cred_src.account_number
     AND cred.deactivated_at IS NULL
    WHERE src.operating_company_id = v_primary
    ON CONFLICT (operating_company_id, template_code) DO NOTHING;
  END LOOP;

  ALTER TABLE catalogs.posting_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.posting_templates FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS company_scope ON catalogs.posting_templates;
  DROP POLICY IF EXISTS posting_templates_select ON catalogs.posting_templates;
  DROP POLICY IF EXISTS posting_templates_insert ON catalogs.posting_templates;
  DROP POLICY IF EXISTS posting_templates_update ON catalogs.posting_templates;
  CREATE POLICY company_scope ON catalogs.posting_templates
    FOR ALL
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );
  REVOKE DELETE ON catalogs.posting_templates FROM ih35_app;
  GRANT SELECT, INSERT, UPDATE ON catalogs.posting_templates TO ih35_app;
END
$mig$;

COMMIT;
