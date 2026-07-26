-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — Neon hand-apply + ledger-backfill.
-- Registered in db/migrations/.held-migrations.json.
--
-- DETAIL_TYPES_FK_OWNER_UNLOCK — owner 2026-07-25 WIRE (LINK-02): real FK
-- catalogs.accounts.detail_type_id → catalogs.detail_types is approved. account_subtype text cache retained.
-- Neon-applied 2026-07-25T22:15:16Z (neondb_owner); ledger checksum pinned; post-unlock comment does not re-apply.
--
-- LINK-02: catalogs.accounts.detail_type_id → catalogs.detail_types(id).
-- Keeps account_subtype text as display/cache. Best-effort backfill by normalized name/qbo name.
-- Trigger: detail type must be global (opco NULL) or same company; account_type must match.
--
-- Idempotent / additive / fresh-DB safe (0-row backfill OK).

BEGIN;

ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS detail_type_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_detail_type_id_fkey'
      AND conrelid = 'catalogs.accounts'::regclass
  ) THEN
    ALTER TABLE catalogs.accounts
      ADD CONSTRAINT accounts_detail_type_id_fkey
      FOREIGN KEY (detail_type_id)
      REFERENCES catalogs.detail_types(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_detail_type_id
  ON catalogs.accounts (detail_type_id)
  WHERE detail_type_id IS NOT NULL;

-- Best-effort backfill (normalized alphanumeric compare). Leaves NULL when no match.
UPDATE catalogs.accounts a
SET detail_type_id = dt.id
FROM catalogs.detail_types dt
JOIN catalogs.account_types at ON at.id = dt.account_type_id
WHERE a.detail_type_id IS NULL
  AND a.account_subtype IS NOT NULL
  AND length(trim(a.account_subtype)) > 0
  AND (dt.operating_company_id IS NULL OR dt.operating_company_id = a.operating_company_id)
  AND at.is_active = true
  AND (
    at.code = a.account_type
    OR at.name = a.account_type
  )
  AND (
    lower(regexp_replace(dt.name, '[^a-zA-Z0-9]', '', 'g'))
      = lower(regexp_replace(a.account_subtype, '[^a-zA-Z0-9]', '', 'g'))
    OR lower(regexp_replace(COALESCE(dt.qbo_detail_type_name, ''), '[^a-zA-Z0-9]', '', 'g'))
      = lower(regexp_replace(a.account_subtype, '[^a-zA-Z0-9]', '', 'g'))
  );

CREATE OR REPLACE FUNCTION catalogs.accounts_detail_type_scope_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_dt_opco uuid;
  v_dt_type_code text;
  v_dt_type_name text;
BEGIN
  IF NEW.detail_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dt.operating_company_id, at.code, at.name
    INTO v_dt_opco, v_dt_type_code, v_dt_type_name
  FROM catalogs.detail_types dt
  JOIN catalogs.account_types at ON at.id = dt.account_type_id
  WHERE dt.id = NEW.detail_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounts.detail_type_id % not found', NEW.detail_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_dt_opco IS NOT NULL AND v_dt_opco IS DISTINCT FROM NEW.operating_company_id THEN
    RAISE EXCEPTION 'accounts.detail_type_id cross-entity (detail_type opco %, account opco %)',
      v_dt_opco, NEW.operating_company_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.account_type IS NOT NULL
     AND NEW.account_type IS DISTINCT FROM v_dt_type_code
     AND NEW.account_type IS DISTINCT FROM v_dt_type_name THEN
    RAISE EXCEPTION 'accounts.detail_type_id account_type mismatch (account %, detail_type %/%)',
      NEW.account_type, v_dt_type_code, v_dt_type_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_detail_type_scope ON catalogs.accounts;
CREATE TRIGGER trg_accounts_detail_type_scope
  BEFORE INSERT OR UPDATE OF detail_type_id, account_type, operating_company_id
  ON catalogs.accounts
  FOR EACH ROW
  EXECUTE FUNCTION catalogs.accounts_detail_type_scope_check();

COMMIT;
