-- [HOLD-FOR-JORGE — TIER 1] AF-3 — catalogs.classes per-entity. POSTS NOTHING.
-- Mirrors AF-1 (catalogs.accounts) / AF-2 (catalogs.items): adds operating_company_id,
-- replaces the 3 global uniques with per-entity composite uniques, converts the role-only
-- RLS to entity+role RLS, and unlocks the deferred same-entity composite FK for
-- catalogs.items.default_class_id (FLAG-CLASSES from AF-2).
--
-- GUARD-VERIFIED LIVE PROD (br-fancy-credit-akjnd07a, 2026-07-01): catalogs.classes is GLOBAL
-- (no operating_company_id), RLS enabled+forced with role-only policies, and holds 0 rows
-- (total/active/qbo all 0, 0 used by items) → backfill is a clean no-op. Idempotent + fresh-DB safe.
-- On a fresh CI DB the AF-2 migration (202606300080) runs before this one, so
-- catalogs.items.operating_company_id already exists when the items composite FK is added below.
-- Runs on a Neon branch only. DO NOT MERGE / RUN ON PROD without Jorge's JORGE-APPROVED ceremony.

BEGIN;

DO $$
DECLARE v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code='TRANSP' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='classes' AND column_name='operating_company_id') THEN
    ALTER TABLE catalogs.classes ADD COLUMN operating_company_id uuid;
    ALTER TABLE catalogs.classes ADD CONSTRAINT classes_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  -- backfill any existing rows → TRANSP (prod has 0; guards future seeds). No split (no cross-entity signal).
  IF v_transp IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='classes'
        AND column_name='operating_company_id' AND is_nullable='YES') THEN
    UPDATE catalogs.classes SET operating_company_id = v_transp WHERE operating_company_id IS NULL;
    -- only flip NOT NULL if the table is non-empty (fresh empty DB stays nullable, harmless)
    IF EXISTS (SELECT 1 FROM catalogs.classes) THEN
      ALTER TABLE catalogs.classes ALTER COLUMN operating_company_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- per-entity composite uniques (replace 3 global uniques)
ALTER TABLE catalogs.classes DROP CONSTRAINT IF EXISTS classes_class_name_key;
ALTER TABLE catalogs.classes DROP CONSTRAINT IF EXISTS classes_class_code_key;
ALTER TABLE catalogs.classes DROP CONSTRAINT IF EXISTS classes_qbo_class_id_key;
DROP INDEX IF EXISTS catalogs.classes_class_name_key;
DROP INDEX IF EXISTS catalogs.classes_class_code_key;
DROP INDEX IF EXISTS catalogs.classes_qbo_class_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_company_class_name
  ON catalogs.classes (operating_company_id, class_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_company_class_code
  ON catalogs.classes (operating_company_id, class_code) WHERE class_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_company_qbo_class_id
  ON catalogs.classes (operating_company_id, qbo_class_id) WHERE qbo_class_id IS NOT NULL;

-- unlock same-entity composite FK for items.default_class_id (deferred from AF-2 / FLAG-CLASSES)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='catalogs' AND table_name='classes' AND column_name='operating_company_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_classes_company_id' AND conrelid='catalogs.classes'::regclass) THEN
      ALTER TABLE catalogs.classes ADD CONSTRAINT uq_classes_company_id UNIQUE (operating_company_id, id);
    END IF;
    -- only if AF-2 has already added operating_company_id to catalogs.items (it runs before this by number)
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='catalogs' AND table_name='items' AND column_name='operating_company_id') THEN
      ALTER TABLE catalogs.items DROP CONSTRAINT IF EXISTS items_default_class_id_fkey;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_class_same_entity_fkey' AND conrelid='catalogs.items'::regclass) THEN
        ALTER TABLE catalogs.items ADD CONSTRAINT items_class_same_entity_fkey
          FOREIGN KEY (operating_company_id, default_class_id) REFERENCES catalogs.classes (operating_company_id, id);
      END IF;
    END IF;
  END IF;
END $$;
-- NOTE: posting_templates.default_class_id / banking_rules.then_class_id / journal_entry_postings.class_id
-- remain single-col FKs (their parents carry operating_company_id; app-layer + AF-1 pattern govern same-entity).
-- Hardening those to composite is a follow-up if required — FLAGGED, not silently resolved.

-- entity-scoped RLS (write-role gate preserved + entity isolation)
ALTER TABLE catalogs.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_select ON catalogs.classes;
DROP POLICY IF EXISTS classes_insert ON catalogs.classes;
DROP POLICY IF EXISTS classes_update ON catalogs.classes;
DROP POLICY IF EXISTS classes_entity_select ON catalogs.classes;
DROP POLICY IF EXISTS classes_entity_write ON catalogs.classes;
CREATE POLICY classes_entity_select ON catalogs.classes FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY classes_entity_write ON catalogs.classes FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Accountant'::identity.role_enum])));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ih35_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.classes TO ih35_app;
  END IF;
END $$;

COMMIT;
