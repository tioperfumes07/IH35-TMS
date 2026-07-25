# NEON APPLY — LINK-02 `catalogs.accounts.detail_type_id` (2026-07-25)

**FINDING:** LINK-02 · **Lane:** FINANCIAL-HOLD · **Module:** accounting / catalogs  
**Owner ruling:** WIRE (2026-07-25) — real FK to detail types; cascade by account type; + Create in-app.  
**Migration:** `db/migrations/202608080000_acct_link_02_accounts_detail_type_fk.sql`  
**sha256:** `4d66df412a4164b9e2c7b54b8d93c714b6f2557792884d9d1af9ee962e21bc39`  
**Flags:** N/A (no feature flag). QBO projection flags stay OFF.

## Deploy sequencing (non-negotiable)

Backend `SELECT`/`INSERT`/`PATCH` now reference `detail_type_id`.  
**Neon-apply this migration BEFORE Render deploys the PR** (or COA list/create 500s).

## What it does

1. Additive `catalogs.accounts.detail_type_id uuid` → FK `catalogs.detail_types(id)` ON DELETE SET NULL  
2. Best-effort backfill by normalized subtype / QBO detail name + account_type match  
3. Trigger: same-entity or global detail type; account_type must match  
4. Keeps `account_subtype` text as display cache  

Leftover NULL `detail_type_id` rows are OK until an operator re-saves with the FK picker.

---

### Paste 1 — apply DDL (Neon SQL Editor · `neondb_owner` · prod `br-fancy-credit-akjnd07a`)

Paste the **full file** contents of:

`db/migrations/202608080000_acct_link_02_accounts_detail_type_fk.sql`

(already wrapped in `BEGIN;` / `COMMIT;`)

---

### Paste 2 — dual ledger backfill

```sql
BEGIN;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by)
VALUES (
  '202608080000_acct_link_02_accounts_detail_type_fk.sql',
  '4d66df412a4164b9e2c7b54b8d93c714b6f2557792884d9d1af9ee962e21bc39',
  now(),
  'neondb_owner'
)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES (
  '202608080000_acct_link_02_accounts_detail_type_fk.sql',
  now(),
  'jorge-neon-hand-apply'
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
```

---

### Paste 3 — prove effect (same txn · RLS bypass)

```sql
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

SELECT
  (SELECT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'catalogs' AND table_name = 'accounts' AND column_name = 'detail_type_id'
   )) AS col_exists,
  (SELECT EXISTS (
     SELECT 1 FROM pg_constraint
     WHERE conname = 'accounts_detail_type_id_fkey'
       AND conrelid = 'catalogs.accounts'::regclass
   )) AS fk_exists,
  (SELECT EXISTS (
     SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'catalogs' AND p.proname = 'accounts_detail_type_scope_check'
   )) AS trigger_fn_exists,
  (SELECT count(*)::int FROM catalogs.accounts WHERE detail_type_id IS NOT NULL) AS backfilled_nonnull,
  (SELECT count(*)::int FROM catalogs.accounts WHERE account_subtype IS NOT NULL AND detail_type_id IS NULL) AS leftover_null,
  (SELECT EXISTS (
     SELECT 1 FROM _system._schema_migrations
     WHERE filename = '202608080000_acct_link_02_accounts_detail_type_fk.sql'
   )) AS system_ledger,
  (SELECT EXISTS (
     SELECT 1 FROM ih35_migrations.applied_migrations
     WHERE name = '202608080000_acct_link_02_accounts_detail_type_fk.sql'
   )) AS ih35_ledger;

COMMIT;
```

**PASS:** `col_exists` / `fk_exists` / `trigger_fn_exists` / both ledgers = true.  
`backfilled_nonnull` > 0 expected; `leftover_null` may be > 0 (CamelCase leftovers — re-save fixes).

## After PASS

1. Stamp `applied_on_prod: true` on held registry entry for `202608080000_…`  
2. Extend `scripts/lib/prod-migration-ledger-checksums.json` with the sha256 above  
3. Merge/deploy PR only after Paste 1–3 PASS (or apply immediately post-merge before deploy rolls)

## REMAINING

- LST-F17: per-entity `catalogs.cancellation_reasons.operating_company_id` (separate block)  
- FLAGS: LATER — leave QBO projection OFF  
