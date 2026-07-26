# LINK-02 — owner one-statement Neon apply (2026-07-25)

**Why this exists:** Neon MCP / `ih35_app` **cannot** `ALTER catalogs.accounts`
(`must be owner of table accounts` — owner is `neondb_owner`). Paste 2 already
stamped both ledgers. Paste 1 never landed. Run these **one statement at a time**
in Neon Console SQL Editor as **`neondb_owner`** on prod `br-fancy-credit-akjnd07a`.

**Do not re-run Paste 2 (ledger).** Ledgers are already true.

---

### 1A — column
```sql
ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS detail_type_id uuid;
```

### 1B — drop stale FK name (safe if absent)
```sql
ALTER TABLE catalogs.accounts
  DROP CONSTRAINT IF EXISTS accounts_detail_type_id_fkey;
```

### 1C — FK
```sql
ALTER TABLE catalogs.accounts
  ADD CONSTRAINT accounts_detail_type_id_fkey
  FOREIGN KEY (detail_type_id)
  REFERENCES catalogs.detail_types(id)
  ON DELETE SET NULL;
```

### 1D — index
```sql
CREATE INDEX IF NOT EXISTS idx_accounts_detail_type_id
  ON catalogs.accounts (detail_type_id)
  WHERE detail_type_id IS NOT NULL;
```

### 1E — backfill
```sql
UPDATE catalogs.accounts a
SET detail_type_id = dt.id
FROM catalogs.detail_types dt
JOIN catalogs.account_types at ON at.id = dt.account_type_id
WHERE a.detail_type_id IS NULL
  AND a.account_subtype IS NOT NULL
  AND length(trim(a.account_subtype)) > 0
  AND (dt.operating_company_id IS NULL OR dt.operating_company_id = a.operating_company_id)
  AND at.is_active = true
  AND (at.code = a.account_type OR at.name = a.account_type)
  AND (
    lower(regexp_replace(dt.name, '[^a-zA-Z0-9]', '', 'g'))
      = lower(regexp_replace(a.account_subtype, '[^a-zA-Z0-9]', '', 'g'))
    OR lower(regexp_replace(COALESCE(dt.qbo_detail_type_name, ''), '[^a-zA-Z0-9]', '', 'g'))
      = lower(regexp_replace(a.account_subtype, '[^a-zA-Z0-9]', '', 'g'))
  );
```

### 1F — scope function
```sql
CREATE OR REPLACE FUNCTION catalogs.accounts_detail_type_scope_check()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
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
$fn$;
```

### 1G — drop trigger (if any)
```sql
DROP TRIGGER IF EXISTS trg_accounts_detail_type_scope ON catalogs.accounts;
```

### 1H — create trigger
```sql
CREATE TRIGGER trg_accounts_detail_type_scope
  BEFORE INSERT OR UPDATE OF detail_type_id, account_type, operating_company_id
  ON catalogs.accounts
  FOR EACH ROW
  EXECUTE FUNCTION catalogs.accounts_detail_type_scope_check();
```

---

### Prove (catalog only — no column reference until col exists)
```sql
SELECT set_config('app.bypass_rls', 'lucia', true);

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalogs' AND table_name = 'accounts'
      AND column_name = 'detail_type_id'
  ) AS col_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_detail_type_id_fkey'
      AND conrelid = 'catalogs.accounts'::regclass
  ) AS fk_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catalogs' AND p.proname = 'accounts_detail_type_scope_check'
  ) AS trigger_fn_exists,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalogs' AND c.relname = 'accounts'
      AND t.tgname = 'trg_accounts_detail_type_scope' AND NOT t.tgisinternal
  ) AS trigger_exists,
  EXISTS (
    SELECT 1 FROM _system._schema_migrations
    WHERE filename = '202608080000_acct_link_02_accounts_detail_type_fk.sql'
  ) AS system_ledger,
  EXISTS (
    SELECT 1 FROM ih35_migrations.applied_migrations
    WHERE name = '202608080000_acct_link_02_accounts_detail_type_fk.sql'
  ) AS ih35_ledger;
```

**Only after `col_exists` = true:**
```sql
SELECT set_config('app.bypass_rls', 'lucia', true);
SELECT
  count(*) FILTER (WHERE detail_type_id IS NOT NULL)::int AS backfilled_nonnull,
  count(*) FILTER (WHERE account_subtype IS NOT NULL AND detail_type_id IS NULL)::int AS leftover_null
FROM catalogs.accounts;
```

**PASS:** all six booleans true. Expect ~48 backfilled / ~1340 leftover (temp-branch proof).
Then merge [#3554](https://github.com/tioperfumes07/IH35-TMS/pull/3554).
