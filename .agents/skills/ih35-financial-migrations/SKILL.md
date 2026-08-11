---
name: ih35-financial-migrations
description: >-
  How to author, validate, and gate a database migration in the IH35-TMS repo — the idempotent
  CREATE-only pattern, FORCED row-level security + grants (the 0065 pattern), the void-not-delete /
  append-only rules, genesis-anchor-over-backfill for audit tables, feature-flag seeding (default
  OFF), the fresh-DB-CI-only validation rule, and the db:migrate-hits-prod landmine. Load this for
  ANY change under db/migrations/, or any touch to accounting.* / catalogs.* / a new schema/table/
  grant. OWNER LAW (2026-08-03, FINAL): migrations are financial-cluster but coders have FULL Neon
  access and merge authority — build, validate locally, apply on Neon yourself, merge on green; no
  owner hold, no "wait for OK." Bundles a copy-paste migration template + an RLS/grants snippet.
---

# IH35-TMS — Financial migration authoring

**OWNER LAW (2026-08-03, FINAL — supersedes constitution §1.4's old wording): a migration is still a
financial-cluster change, but coders have FULL Neon access and merge authority — no owner hold.** The flow
is: fresh branch → author → validate on a **local** Postgres (never prod, twice for idempotency) → get the
independent code-review + financial-agent pass + green CI (the 18-key evidence block IS the safeguard, not
an owner click) → **apply the migration on Neon yourself** → merge on green → post the migration SHA →
GUARD re-proves live AFTER. Do not tell the owner to hand-apply or to click "OK to merge" — that step no
longer exists.

Bundled resources (read/copy them — `.sql.tmpl` so the hold-merge-gate treats them as templates, not a
runnable migration; rename to `.sql` under `db/migrations/` when you use them):
- `resources/idempotent-migration-template.sql.tmpl` — a complete CREATE-only table migration to copy.
- `resources/forced-rls-grants-snippet.sql.tmpl` — the FORCED-RLS + grants block on its own.

---

## 1. Numbering
- The filename is a 12-digit timestamp prefix, `YYYYMMDDHHMM_snake_description.sql`
  (e.g. `202607021900_audit_chain_verifications.sql`). A legacy 4-digit form (`0407_...`) also exists;
  match whatever `db/migrations/` currently uses — the timestamp form is current.
- The number must be **strictly greater than main's current max, re-checked at push time**, AND above
  every migration in your own in-flight open PRs. Two migrations with the same/lower number collide and
  break the ledger. Check: `ls db/migrations | grep -oE '^[0-9]{12}' | sort | tail -1`, then also scan
  open PRs for pending migration numbers.

## 2. Idempotency (non-negotiable — CI re-runs migrations on a FRESH DB from 0001)
Every statement must be safe to run twice:
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- Policies: `DROP POLICY IF EXISTS x ON t;` then `CREATE POLICY x ...`.
- Seeds: `INSERT ... ON CONFLICT (...) DO NOTHING`.
- Enums / conditional DDL: wrap in a `DO $$ ... IF NOT EXISTS ... $$;` block.
- **Prefer CREATE-only.** Additive columns/tables over destructive change. Never `DROP TABLE`/`DROP COLUMN`
  a live object.
- **Never `RAISE` on absent runtime/synced data.** A migration that validates on a prod-COPY can still FAIL
  CI because CI builds a fresh DB with none of that data. JOIN gracefully; fail loud at runtime, not in DDL.

## 3. void-not-delete / append-only
- No `DELETE`. Soft-delete via `voided_at` / `archived_at` / `deactivated_at` / `is_active = false`.
  - **Exception — verified test/demo fixture ROWS (owner ruling 2026-07-25).** Those may be hard-DELETEd
    under explicit owner authorisation, scoped by an EXACT business identifier, never by `is_sample_data`
    (false on 176 real rows, true on 17 fixtures — banned, CI-enforced by verify-step 1488). Requires derived
    counts, a fail-loud pre-flight for real rows referencing fixtures, FK-safe order, and the override stated
    in the migration header and PR body. Business rows, columns and tables are NOT covered.
- Grants on such tables are `SELECT, INSERT, UPDATE` — **never DELETE**.
- Audit/evidence tables (anything recording "what happened") are **append-only**: grant `SELECT, INSERT`
  only (no UPDATE, no DELETE). Never `UPDATE`/`DELETE` `audit.row_changes` / `audit_events` /
  `events.event_log`.
- **A narrow `GRANT` is NOT always enough — `ALTER DEFAULT PRIVILEGES` can silently widen it.** Some schemas
  (e.g. `dispatch`) carry default privileges (from 0065) that auto-grant `INSERT, SELECT, UPDATE, DELETE` to
  `ih35_app` on **every new table**, so `GRANT SELECT, INSERT` leaves UPDATE/DELETE in place. To truly enforce
  append-only on such a schema you must **explicitly `REVOKE UPDATE, DELETE ... FROM ih35_app`** after the
  grant. (Schemas without a default grant — e.g. `ops` — stay append-only from the narrow grant alone.)
  **Always verify with `information_schema.role_table_grants`, not by reading the migration** — the effective
  grant is what matters. A `REVOKE` trips the hold-merge-gate classification (→ PROTECTED/logged) — that is
  informational tagging, not a block; the migration firewall check (not a label) is the only hard-fail.
- For a hash-chained audit table, use a **genesis-anchor** (a sequence + trigger assigning `chain_seq`
  on INSERT), **never a backfill UPDATE** — a backfill would violate the write-once property the chain exists
  to prove. (See B19-V1/V2 for the reference implementation.)

## 4. FORCED RLS + grants — the 0065 pattern (every new table)
Every new entity-owned table gets:
1. `operating_company_id uuid NOT NULL` (the RLS scope key). **`mdata.units` is the exception — it has NO
   `operating_company_id`; it uses `owner_company_id` / `currently_leased_to_company_id`.**
2. `ENABLE` **and** `FORCE ROW LEVEL SECURITY` (FORCE so even the table owner is filtered).
3. Entity-scoped policies using the canonical predicate:
   `identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`
   — write policies additionally gate on `identity.current_user_role()` where only Owner/Admin may write.
4. **Grants to `ih35_app`** (the runtime role). A new schema also needs `GRANT USAGE ON SCHEMA x TO ih35_app`.
   Miss the grant and it 500s at runtime with "permission denied". The canonical grant array lives in
   migration 0065 + DEFAULT PRIVILEGES; self-contained per-table grants (as in the template) are the safe habit.

See `resources/forced-rls-grants-snippet.sql.tmpl`.

## 5. Feature-flag seeding (default OFF)
Money/behavior-changing logic ships behind a flag that defaults OFF:
```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES ('MY_FEATURE_ENABLED', '... what it does; DEFAULT OFF — owner-gated.', false, 0)
ON CONFLICT (flag_key) DO NOTHING;
```
Per-entity override is via `lib.feature_flag_overrides`. The endpoint must consult the flag and return a
policy error (e.g. 409) when OFF — **no silent behavior**. The owner flips per entity when ready.

## 6. Seeding under FORCE RLS
A seed INSERT run by the migration role can be blocked by FORCE RLS. Wrap the seed in a bypass:
```sql
DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO ... SELECT ... FROM org.companies c CROSS JOIN (VALUES ...) v
  ON CONFLICT (...) DO NOTHING;
END $seed$;
```

## 7. Local validation — SAFELY (the db:migrate-hits-prod landmine)
`npm run db:migrate` in this clone can **silently connect to PROD** (the `.env` may carry prod
`DATABASE_DIRECT_URL`, and the runner prefers it over an inline `DATABASE_URL`). Before trusting any
connection, verify `SELECT current_database(), inet_server_addr();`. Validate against a **local** Postgres:
- Apply your migration to a local/CI database (e.g. `ih35_ci` on `localhost:5432`) with a direct `psql`,
  or `DATABASE_DIRECT_URL= DATABASE_URL=<local-url> npm run db:migrate`.
- Prove idempotency: apply it **twice** — the second run must be a clean no-op.
- Confirm `FORCE_RLS = true` and the grant set (`SELECT has_table_privilege('ih35_app','schema.table','DELETE')`
  should be false for evidence tables).
- **Never set `ALLOW_PROD_MIGRATE=1` locally.** Local validation stays on the local DB; prod apply happens
  deliberately via the coder's own Neon-apply step (with SHA + proof posted), never via a stray local flag.

## 8. Guards & schema-parity (keep CI green)
After adding a table/column, update the static guards so CI stays green:
- `node scripts/verify-schema-parity.mjs --update` — regenerate the committed baseline (a static parser; no DB).
- Add a new table to `scripts/canonical-relations.json` or the phantom-relation guard fails.
- Write a `scripts/verify-<thing>.mjs` guard for the invariant your migration establishes, and register it
  in the `verify:arch-design` chain in `package.json`. **Every bug fix gets a static guard so it can't regress.**

## 9. CREATE OR REPLACE VIEW is append-only
New view columns must be **appended at the end**; a mid-list insert errors "cannot change name of view column".
Apply view-touching migrations on the local CI DB first. Views use `security_invoker=true`.

---

## Pre-merge checklist (proof you post in the PR/commit — no owner sign-off step)
- [ ] Number strictly above main's max **and** all in-flight PRs (re-checked at push).
- [ ] Idempotent — applied twice locally, second run a no-op.
- [ ] FORCED RLS + entity policies + `ih35_app` grants (SELECT/INSERT[/UPDATE]; **no DELETE** on evidence).
- [ ] Any behavior/money logic behind a **default-OFF** flag (flip only after the owner's chat decision).
- [ ] `verify:schema-parity` regenerated; new table in `canonical-relations.json`; new guard registered.
- [ ] Validated on a **local** DB (proved `current_database()` was NOT prod).
- [ ] Full SQL + `git diff --staged --stat` in the PR body (evidence, not a request for permission).
- [ ] Applied on Neon yourself (FULL access — OWNER LAW 2026-08-03); migration SHA posted; merged on green.
