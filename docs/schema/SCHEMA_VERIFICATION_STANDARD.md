# Schema Verification Standard (canonical) — 2026-06-28

**One authoritative method per question.** Four independent audits on 2026-06-28 disagreed
(RLS counts of 8 / 86 / 145; a "missing grant" that did not reproduce; "empty" tables that were
RLS-masked) **because each used a different method.** This document fixes the method so future
audits converge. The CI gates (`verify-sql-read-targets`, `verify-sql-write-targets`,
`verify-single-migration-dir`, `verify-no-deprecated-schema-creates`, `verify-db-migrate-prod-guard`)
enforce these methods mechanically; humans/agents must use them too.

Every example below was demonstrated to return the claimed shape on a from-0001 migrated DB.

---

## V1 — Does a TABLE / COLUMN exist?
**Method:** query `information_schema` of a **fresh-migrated DB** (run `db/migrations/` from 0001 on a
throwaway/local PG or Neon branch). This is the authoritative model — **NOT** `docs/schema-parity-baseline.json`
(its generator has blind spots; it missed migration 0392).
```sql
-- column exists?
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='accounting' AND table_name='bills' AND column_name='payment_terms_id';   -- 0 = absent
-- table exists?
SELECT to_regclass('mdata.equipment') IS NOT NULL;
```
Used by `verify-sql-read-targets` / `verify-sql-write-targets` (model = live migrated `information_schema`).
**Pitfall:** never trust a hand-maintained JSON snapshot; never trust prod alone (prod can carry drift +
prod-only objects). The from-migrations DB is truth for "what the code's schema should be."

## V2 — Can the runtime role do X (privileges)?
**Method:** `has_table_privilege()` / `has_schema_privilege()` — **runtime truth** (accounts for
inherited / DEFAULT / PUBLIC grants).
```sql
SELECT has_table_privilege('ih35_app','accounting.bills','INSERT');     -- t
SELECT has_schema_privilege('ih35_app','events','USAGE');
```
**NEVER** infer a missing grant from `information_schema.role_table_grants` alone — it lists only EXPLICIT
grants and misses inherited/DEFAULT privileges. (That false method produced the 2026-06-28 "ih35_app missing
INSERT on 3 tables" finding, which did NOT reproduce under `has_table_privilege` = TRUE on all three.)
Only act on a privilege gap if `has_*_privilege()=false` OR a real `42501 permission denied` is produced.

## V3 — Is RLS enabled / forced on a table?
**Method:** `pg_class.relrowsecurity` (ENABLE) + `pg_class.relforcerowsecurity` (FORCE).
```sql
SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
  FROM pg_class WHERE oid='catalogs.accounts'::regclass;   -- t | t
-- count financial tables enabled-but-not-forced:
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity
   AND n.nspname IN ('accounting','banking','driver_finance','settlements', ...);
```
Report ENABLED vs FORCED separately. `forced=f` is bypassed only by the **table-OWNER** role; the app runs
as non-owner `ih35_app`, so FORCE-off is defense-in-depth, not active app exposure. Confirm
`relforcerowsecurity` per table before acting — do not quote an unverified aggregate ("70/86/145").

## V4 — How many rows does a table have (when RLS masks SELECT)?
**Method:** `pg_stat_user_tables.n_live_tup` — an RLS-independent planner stat.
```sql
SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname='mdata' AND relname='drivers';
```
**`mdata.*` RLS is IDENTITY-based** (`is_lucia_bypass() OR operating_company_id IN
org.user_accessible_company_ids() OR identity_user_id = current_user_id()`) — it does **NOT** key on
`app.operating_company_id`. So a no-session `SELECT count(*)` as owner returns **0 = MASKED, not empty.**
Use `n_live_tup` for magnitude. (`catalogs.*` / `banking.*` RLS DO key on `app.operating_company_id`, so a
`SET app.operating_company_id` + count is valid there.)

## V5 — Does a PAGE / ENDPOINT actually work?
**Method:** capture the **network/XHR response code**, not the rendered shell. A page can render HTTP 200
while its data call 500s (the shell mounts, the card/dashboard errors). Render-only and screenshot sweeps
**miss** these — that's how the 2026-06-28 home `/role-home` 500 and compliance dashboard 500 passed a
render check. Authenticated runtime sweep must record `route | http_status | failed_requests | console_errors`.

## V6 — Which DB am I connected to (prod-safety)?
**Method:** `SELECT current_database(), inet_server_addr();` before any DB command. `inet_server_addr` is
**NULL for a local unix socket**, non-null (Neon IP) for remote/prod. Confirm LOCAL before any local migrate.
In this clone, `.env` carries the **prod** `DATABASE_DIRECT_URL` and `db:migrate` does `dotenv.config()` +
`DATABASE_DIRECT_URL || DATABASE_URL`, so an inline local `DATABASE_URL` is silently overridden. Always:
`DATABASE_DIRECT_URL= DATABASE_URL=<local> npm run db:migrate`. The `verify-db-migrate-prod-guard` refuses the
prod endpoint pre-connect unless `ALLOW_PROD_MIGRATE=1` (set ONLY on Render's deploy env, never locally).

---

## Which method for which question
| Question | Method | Never use |
|---|---|---|
| table/column exists? | V1 information_schema of from-0001 migrated DB | schema-parity JSON; prod-only |
| role can INSERT/USAGE? | V2 has_table_privilege / has_schema_privilege | role_table_grants (explicit-only) |
| RLS enabled/forced? | V3 pg_class.relrowsecurity / relforcerowsecurity | assumptions / unverified counts |
| row magnitude (RLS tables)? | V4 pg_stat_user_tables.n_live_tup | no-session SELECT count(*) (masked→0) |
| does a page work? | V5 network/XHR status capture | render/screenshot only |
| which DB am I on? | V6 current_database() + inet_server_addr() | trusting an inline DATABASE_URL alone |
