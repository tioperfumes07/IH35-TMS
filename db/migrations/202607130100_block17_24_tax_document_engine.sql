-- [HOLD-FOR-JORGE — TIER 1] BLOCK-17/24 — 1099-NEC/1042-S annual generation + general
-- tax-document PDF engine (catalogs.payee_tax_profile, catalogs.tax_form_thresholds,
-- accounting.tax_document(_batch), accounting.form_1099_nec, accounting.form_1042_s).
--
-- *** DO NOT MERGE-AND-RUN. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand,
--     then ledger-backfill so prod db:migrate skips it. Financial cluster (accounting.*,
--     catalogs.*, new GRANTs) — never self-merge per constitution §1.3/§1.4. ***
--
-- Builds the schema for docs/specs/1099-and-tax-doc-BLOCK-17-DESIGN.md (PR #2178, merged
-- design doc). Read that doc for full rationale, IRS-rule citations, and open CPA questions
-- (§9 — NRA withholding + income-sourcing are NOT resolved by this migration, only made
-- representable). No new GL math: box-1 comp is a READ off driver_finance.settlement_lines,
-- never a journal entry. No IRS e-file/transmission logic anywhere in this repo (Jorge
-- transmits by hand every year — hard product boundary, not a phase-1 simplification).
--
-- Reuses existing infra only: docs.files/docs.file_links (PDF archive — additive CHECK
-- widen below), safety.driver_w8ben (foreign-status FK), org.companies (payer snapshot),
-- driver_finance.settlement_lines (box-1 source), lib.feature_flags (kill-switch).
--
-- Fresh-DB safe: every statement is CREATE-only / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO
-- NOTHING. Never RAISEs on absent runtime data.

BEGIN;

-- ── 1. catalogs.payee_tax_profile ────────────────────────────────────────────────────────
-- One row per taxable payee per tax year (driver today; vendor future). Polymorphic like
-- docs.file_links rather than inlining W-9/W-8BEN columns onto mdata.drivers/mdata.vendors.
CREATE TABLE IF NOT EXISTS catalogs.payee_tax_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payee_type text NOT NULL CHECK (payee_type IN ('driver', 'vendor')),
  payee_id uuid NOT NULL,
  tax_status text NOT NULL CHECK (tax_status IN ('us_person', 'foreign_person', 'incomplete')),
  -- US-person path
  w9_on_file boolean NOT NULL DEFAULT false,
  w9_us_tin text NULL,
  w9_tin_type text NULL CHECK (w9_tin_type IN ('ssn', 'ein', 'itin')),
  w9_captured_at timestamptz NULL,
  w9_file_id uuid NULL REFERENCES docs.files(id),
  -- Foreign-person path — FKs the existing W-8BEN capture rather than re-capturing.
  w8ben_id uuid NULL REFERENCES safety.driver_w8ben(id),
  income_source_determination text NULL
    CHECK (income_source_determination IN ('us_source', 'foreign_source', 'mixed_unresolved')),
  treaty_benefit_claimed boolean NOT NULL DEFAULT false,
  backup_withholding_required boolean NOT NULL DEFAULT false,
  effective_tax_year int NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  updated_by_user_id uuid NULL REFERENCES identity.users(id),
  CONSTRAINT payee_tax_profile_us_or_foreign_chk CHECK (
    (tax_status = 'us_person' AND w8ben_id IS NULL)
    OR (tax_status = 'foreign_person' AND w8ben_id IS NOT NULL)
    OR (tax_status = 'incomplete')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payee_tax_profile_year
  ON catalogs.payee_tax_profile (operating_company_id, payee_type, payee_id, effective_tax_year)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payee_tax_profile_payee
  ON catalogs.payee_tax_profile (payee_type, payee_id)
  WHERE voided_at IS NULL;

-- ── 2. catalogs.tax_form_thresholds — year-keyed, never hardcoded in application code ────
CREATE TABLE IF NOT EXISTS catalogs.tax_form_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year int NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('1099_nec', '1042_s')),
  reporting_threshold_cents bigint NOT NULL,
  recipient_copy_due_date date NOT NULL,
  irs_copy_due_date date NOT NULL,
  backup_withholding_rate_bps int NOT NULL DEFAULT 2400,
  nra_withholding_rate_bps int NOT NULL DEFAULT 3000,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tax_year, form_type)
);

-- Global IRS reference data — not operating_company_id-scoped (same rule for every entity).
-- Seed the years this carrier actually spans: 2024/2025 (pre-threshold-change) and 2026+ (post).
INSERT INTO catalogs.tax_form_thresholds
  (tax_year, form_type, reporting_threshold_cents, recipient_copy_due_date, irs_copy_due_date, notes)
VALUES
  (2024, '1099_nec', 60000, '2025-01-31', '2025-01-31', 'Pre-TY2026 $600 NEC threshold.'),
  (2025, '1099_nec', 60000, '2026-01-31', '2026-01-31', 'Pre-TY2026 $600 NEC threshold.'),
  (2026, '1099_nec', 200000, '2027-01-31', '2027-01-31', '$2,000 threshold effective for payments on/after 2026-01-01.'),
  (2027, '1099_nec', 200000, '2028-01-31', '2028-01-31', '$2,000 threshold + annual inflation adjustment begins — verify exact indexed amount before use.'),
  (2024, '1042_s', 0, '2025-03-15', '2025-03-15', 'No reporting floor for foreign-person US-source income.'),
  (2025, '1042_s', 0, '2026-03-15', '2026-03-15', 'No reporting floor for foreign-person US-source income.'),
  (2026, '1042_s', 0, '2027-03-15', '2027-03-15', 'No reporting floor for foreign-person US-source income.'),
  (2027, '1042_s', 0, '2028-03-15', '2028-03-15', 'No reporting floor for foreign-person US-source income.')
ON CONFLICT (tax_year, form_type) DO NOTHING;

-- ── 3. accounting.tax_document_batch ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting.tax_document_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_year int NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('1099_nec', '1042_s')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'issued', 'archived')),
  payee_count int NOT NULL DEFAULT 0,
  total_comp_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  reviewed_at timestamptz NULL,
  reviewed_by_user_id uuid NULL REFERENCES identity.users(id),
  issued_at timestamptz NULL,
  issued_by_user_id uuid NULL REFERENCES identity.users(id),
  UNIQUE (operating_company_id, tax_year, form_type)
);

-- ── 4. accounting.tax_document — the general reusable tax-PDF engine spine ──────────────
CREATE TABLE IF NOT EXISTS accounting.tax_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  document_kind text NOT NULL CHECK (
    document_kind IN ('form_1099_nec', 'form_1042_s', 'form_2290', 'ifta_quarterly_return', 'other')
  ),
  tax_year int NOT NULL,
  batch_id uuid NULL REFERENCES accounting.tax_document_batch(id),
  subject_payee_id uuid NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'archived', 'voided')),
  file_id uuid NULL REFERENCES docs.files(id),
  rendered_at timestamptz NULL,
  render_template_version text NULL,
  mailed_at timestamptz NULL,
  mailed_to_address_snapshot jsonb NULL,
  emailed_at timestamptz NULL,
  emailed_to_address text NULL,
  email_message_id text NULL,
  issued_at timestamptz NULL,
  issued_by_user_id uuid NULL REFERENCES identity.users(id),
  voided_at timestamptz NULL,
  voided_reason text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_tax_document_company_year
  ON accounting.tax_document (operating_company_id, tax_year, document_kind);

CREATE INDEX IF NOT EXISTS idx_tax_document_batch
  ON accounting.tax_document (batch_id) WHERE batch_id IS NOT NULL;

-- ── 5. accounting.form_1099_nec / accounting.form_1042_s — box data only ─────────────────
CREATE TABLE IF NOT EXISTS accounting.form_1099_nec (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_document_id uuid NOT NULL REFERENCES accounting.tax_document(id),
  tax_year int NOT NULL,
  payee_tax_profile_id uuid NOT NULL REFERENCES catalogs.payee_tax_profile(id),
  payer_legal_name text NOT NULL,
  payer_tin text NOT NULL,
  payer_address_snapshot jsonb NOT NULL,
  recipient_name text NOT NULL,
  recipient_tin_masked text NOT NULL,
  recipient_address_snapshot jsonb NOT NULL,
  box1_nonemployee_comp_cents bigint NOT NULL CHECK (box1_nonemployee_comp_cents >= 0),
  box4_federal_income_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  box5_state_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  box6_state_payer_number text NULL,
  box7_state_income_cents bigint NOT NULL DEFAULT 0,
  is_corrected boolean NOT NULL DEFAULT false,
  corrects_form_id uuid NULL REFERENCES accounting.form_1099_nec(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'voided')),
  issued_at timestamptz NULL,
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, payee_tax_profile_id, tax_year)
);

CREATE TABLE IF NOT EXISTS accounting.form_1042_s (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_document_id uuid NOT NULL REFERENCES accounting.tax_document(id),
  tax_year int NOT NULL,
  payee_tax_profile_id uuid NOT NULL REFERENCES catalogs.payee_tax_profile(id),
  withholding_agent_legal_name text NOT NULL,
  withholding_agent_ein text NOT NULL,
  recipient_name text NOT NULL,
  recipient_country_code text NOT NULL,
  recipient_foreign_tin text NULL,
  recipient_us_tin text NULL,
  income_code text NOT NULL DEFAULT '17',
  gross_income_cents bigint NOT NULL CHECK (gross_income_cents >= 0),
  chapter3_exemption_code text NULL,
  tax_rate_bps int NOT NULL DEFAULT 3000,
  federal_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  treaty_country_code text NULL,
  treaty_article text NULL,
  is_corrected boolean NOT NULL DEFAULT false,
  corrects_form_id uuid NULL REFERENCES accounting.form_1042_s(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'voided')),
  issued_at timestamptz NULL,
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, payee_tax_profile_id, tax_year)
);

-- ── 6. Immutability once issued — DB-level guard, not just app discipline ────────────────
-- Two separate trigger functions (not one shared one) — NEW/OLD are typed to each table's own
-- rowtype, and a single shared function referencing box columns that only exist on ONE of the
-- two tables raises "record has no field" at runtime even inside an apparently-short-circuited
-- TG_TABLE_NAME guard (verified locally). Same immutability rule, two small functions.
CREATE OR REPLACE FUNCTION accounting.block_issued_1099_nec_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'issued' AND TG_OP = 'UPDATE' THEN
    -- Only voided_at/voided_reason (void-not-delete) may still change on an issued row.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'voided' THEN
      RAISE EXCEPTION 'accounting.form_1099_nec is issued and immutable — only void is allowed';
    END IF;
    IF NEW.box1_nonemployee_comp_cents IS DISTINCT FROM OLD.box1_nonemployee_comp_cents
      OR NEW.box4_federal_income_tax_withheld_cents IS DISTINCT FROM OLD.box4_federal_income_tax_withheld_cents
      OR NEW.box5_state_tax_withheld_cents IS DISTINCT FROM OLD.box5_state_tax_withheld_cents
      OR NEW.box7_state_income_cents IS DISTINCT FROM OLD.box7_state_income_cents
    THEN
      RAISE EXCEPTION 'accounting.form_1099_nec is issued — box values are immutable; file a corrected form instead';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.block_issued_1042_s_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'issued' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'voided' THEN
      RAISE EXCEPTION 'accounting.form_1042_s is issued and immutable — only void is allowed';
    END IF;
    IF NEW.gross_income_cents IS DISTINCT FROM OLD.gross_income_cents
      OR NEW.federal_tax_withheld_cents IS DISTINCT FROM OLD.federal_tax_withheld_cents
    THEN
      RAISE EXCEPTION 'accounting.form_1042_s is issued — box values are immutable; file a corrected form instead';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_issued_1099_nec_mutation ON accounting.form_1099_nec;
CREATE TRIGGER trg_block_issued_1099_nec_mutation
BEFORE UPDATE ON accounting.form_1099_nec
FOR EACH ROW EXECUTE FUNCTION accounting.block_issued_1099_nec_mutation();

DROP TRIGGER IF EXISTS trg_block_issued_1042_s_mutation ON accounting.form_1042_s;
CREATE TRIGGER trg_block_issued_1042_s_mutation
BEFORE UPDATE ON accounting.form_1042_s
FOR EACH ROW EXECUTE FUNCTION accounting.block_issued_1042_s_mutation();

CREATE OR REPLACE FUNCTION accounting.block_issued_tax_document_pdf_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'issued' AND TG_OP = 'UPDATE' THEN
    IF NEW.file_id IS DISTINCT FROM OLD.file_id
      OR NEW.render_template_version IS DISTINCT FROM OLD.render_template_version
    THEN
      RAISE EXCEPTION 'accounting.tax_document is issued — the rendered PDF is immutable; void + create a corrected document instead';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_issued_tax_document_pdf_mutation ON accounting.tax_document;
CREATE TRIGGER trg_block_issued_tax_document_pdf_mutation
BEFORE UPDATE ON accounting.tax_document
FOR EACH ROW EXECUTE FUNCTION accounting.block_issued_tax_document_pdf_mutation();

-- ── 7. Additive widen: docs.file_links.entity_type gets a 'tax_document' member ──────────
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'docs'
    AND rel.relname = 'file_links'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%entity_type%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%tax_document%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE docs.file_links DROP CONSTRAINT %I', v_conname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'docs' AND rel.relname = 'file_links'
      AND con.conname = 'chk_file_links_entity_type_widened_taxdoc'
  ) THEN
    ALTER TABLE docs.file_links
      ADD CONSTRAINT chk_file_links_entity_type_widened_taxdoc
      CHECK (entity_type IN (
        'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice', 'tax_document'
      ));
  END IF;
END
$$;

-- ── 8. FORCED RLS + entity policies (write gated to Owner/Administrator/Accountant) ──────
ALTER TABLE catalogs.payee_tax_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.payee_tax_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.tax_document_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.tax_document_batch FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.tax_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.tax_document FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.form_1099_nec ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.form_1099_nec FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.form_1042_s ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.form_1042_s FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payee_tax_profile_read ON catalogs.payee_tax_profile;
CREATE POLICY payee_tax_profile_read ON catalogs.payee_tax_profile
  FOR SELECT TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS payee_tax_profile_write ON catalogs.payee_tax_profile;
CREATE POLICY payee_tax_profile_write ON catalogs.payee_tax_profile
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

DROP POLICY IF EXISTS payee_tax_profile_update ON catalogs.payee_tax_profile;
CREATE POLICY payee_tax_profile_update ON catalogs.payee_tax_profile
  FOR UPDATE TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

DROP POLICY IF EXISTS tax_document_batch_scope ON accounting.tax_document_batch;
CREATE POLICY tax_document_batch_scope ON accounting.tax_document_batch
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

DROP POLICY IF EXISTS tax_document_scope ON accounting.tax_document;
CREATE POLICY tax_document_scope ON accounting.tax_document
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

DROP POLICY IF EXISTS form_1099_nec_scope ON accounting.form_1099_nec;
CREATE POLICY form_1099_nec_scope ON accounting.form_1099_nec
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

DROP POLICY IF EXISTS form_1042_s_scope ON accounting.form_1042_s;
CREATE POLICY form_1042_s_scope ON accounting.form_1042_s
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      AND identity.current_user_role() IN ('Owner', 'Administrator', 'Accountant')
    )
  );

-- ── 9. Grants — void-not-delete everywhere in this cluster (no DELETE anywhere) ──────────
-- NOTE: both `accounting` and `catalogs` schemas carry ALTER DEFAULT PRIVILEGES from earlier
-- migrations that auto-grant ALL (including DELETE) to ih35_app on every new table in-schema
-- (verified locally: has_table_privilege('ih35_app', <table>, 'DELETE') was TRUE immediately
-- after the bare GRANT below, before these REVOKEs — the narrow GRANT alone is NOT enough,
-- per the migration-authoring standard). Explicit REVOKE DELETE closes that gap so this is
-- true void-not-delete, not just narrow-grant-in-appearance.
GRANT SELECT, INSERT, UPDATE ON catalogs.payee_tax_profile TO ih35_app;
REVOKE DELETE ON catalogs.payee_tax_profile FROM ih35_app;

GRANT SELECT ON catalogs.tax_form_thresholds TO ih35_app;
REVOKE INSERT, UPDATE, DELETE ON catalogs.tax_form_thresholds FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON accounting.tax_document_batch TO ih35_app;
REVOKE DELETE ON accounting.tax_document_batch FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON accounting.tax_document TO ih35_app;
REVOKE DELETE ON accounting.tax_document FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON accounting.form_1099_nec TO ih35_app;
REVOKE DELETE ON accounting.form_1099_nec FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON accounting.form_1042_s TO ih35_app;
REVOKE DELETE ON accounting.form_1042_s FROM ih35_app;

-- ── 10. Feature flag — default OFF, owner/CPA-gated ──────────────────────────────────────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'TAX_DOC_1099_ENABLED',
  'Annual 1099-NEC/1042-S generation + general tax-document PDF engine. DEFAULT OFF — owner/CPA-gated. When OFF, /api/v1/tax-documents/* returns 409. Never e-files/transmits to the IRS — Jorge transmits by hand.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
