# INVENTORY — every FK column referencing `catalogs.classes(id)` (Tier-1 design prep, NO migration)

Parallel sibling to `docs/specs/CATALOGS-ACCOUNTS-FK-INVENTORY.md` (#1518). The accounts inventory flagged
`catalogs.classes` as almost certainly the **same global-namespace entity leak**. This doc confirms it and
enumerates its re-key surface. **NOT folded into the accounts migration — its own parallel work.**

> Status: **design doc, Tier-3, no schema change.** No migration written or run. Two columns of truth:
> repo-derived (this doc, complete) + live-derived (PENDING, §1.5-gated — introspection SQL in §4).

---

## 0. VERDICT — is `catalogs.classes` the same leak? **YES.**
`catalogs.classes` is a single **GLOBAL** table with **no entity column** and **global UNIQUE** on
`class_name`, `class_code`, AND `qbo_class_id` (0010:48–51). It DOES have RLS enabled+forced (0010:175–176),
but the policies are **role-based, NOT entity-based** — so RLS provides zero tenant isolation:

```sql
-- 0010:224-231  (select)  — ANY authenticated user sees ALL classes
USING ( identity.is_lucia_bypass() OR identity.current_user_role() IS NOT NULL )
-- 0010:233-253  (insert/update) — role-gated write, still no entity filter
WITH CHECK ( identity.is_lucia_bypass() OR identity.current_user_role() IN ('Owner','Administrator','Manager','Accountant') )
```

**This is the SAME leak as `catalogs.accounts`, and arguably more deceptive**: accounts has *no* RLS (obviously
global), whereas classes has RLS *on* — giving false confidence of isolation while the policy never filters by
`operating_company_id` (there is no such column to filter on). TRANSP / TRK / USMCA all see the identical global
class rows; the global UNIQUE namespace is the leak mechanism (each independent entity can't have its own "OTR"
class / its own QBO class ids). Same fix shape as accounts: add `operating_company_id`, per-entity composite
UNIQUEs, entity-scoped RLS, re-key all FKs — atomic.

**One material difference (lowers risk):** all 5 referencing FK columns are **NULLABLE** (zero NOT NULL). Classes
is an *optional* dimension on every posting/line, so the re-key is far less load-bearing than accounts' 8 NOT NULL
columns. The leak is still real (global UNIQUE + QBO id collision across entities), but a partial/late backfill of
a class FK degrades to "unclassified," it does not hard-fail a posting.

---

## 1. `catalogs.classes` table shape (0010:46–58) — the leak surface
| column | type | constraint | note |
|---|---|---|---|
| `id` | uuid | PK | |
| `class_name` | text | **NOT NULL, UNIQUE (global)** | ⚠️ leak — must become `UNIQUE(operating_company_id, class_name)` |
| `class_code` | text | **UNIQUE (global)** | ⚠️ leak |
| `parent_class_id` | uuid | FK → self | hierarchy; re-key within each entity's copy |
| `qbo_class_id` | text | **UNIQUE (global)** | ⚠️ leak — each entity has its own QBO class ids |
| `notes` / `created_at` / `updated_at` / `deactivated_at` / `created_by_user_id` / `updated_by_user_id` | | | **no `operating_company_id` / `company_id` / `tenant_id`** anywhere |

Confirmed: **no later migration** adds an entity column or changes RLS to be entity-scoped (swept all
`db/migrations/*.sql`). 0123 only *seeds* rows and adds `qbo_class_id` **text tag** columns to `mdata.units` /
`mdata.equipment` (those are QBO mirror tags, NOT FKs to `catalogs.classes`).

---

## 2. The enumerated re-key list — `table.column → catalogs.classes(id)`
6 grep matches → **5 distinct FK columns across 5 tables** (one dup: `journal_entry_postings.class_id` declared
in both 0092 and 0123 via `CREATE TABLE IF NOT EXISTS` — same table, one FK). `NN` = NOT NULL.

| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 1 | `catalogs.classes.parent_class_id` | – | 0010:50 | **self-ref** — re-key WITHIN each entity's copy (hierarchy preserved by new ids) |
| 2 | `catalogs.items.default_class_id` | – | 0010:78 | item default class |
| 3 | `catalogs.posting_templates.default_class_id` | – | 0010:123 | posting-template default class |
| 4 | `accounting.banking_rules.then_class_id` | – | 0186:76 | banking-rule auto-class |
| 5 | `accounting.journal_entry_postings.class_id` | – | 0092:28 / 0123:2466 | **the GL ledger line's class dimension**; declared twice (idempotent); one FK |

**Totals: 5 distinct FK columns / 5 tables** (catalogs 3 cols/3 tbl: classes, items, posting_templates;
accounting 2 cols/2 tbl: banking_rules, journal_entry_postings). **0 NOT NULL** — all optional.

> Cross-check vs accounts inventory: `accounting.journal_entry_postings` and `accounting.banking_rules` and
> `catalogs.posting_templates` / `catalogs.items` each carry BOTH an account FK AND a class FK. The two migrations
> touch overlapping tables but disjoint columns — sequence them so they don't fight over the same table locks.

---

## 3. Flags for Jorge (decisions before the migration)
1. **Confirmed same-leak, same fix shape** as accounts (§0). The classes migration mirrors the accounts DESIGN
   (`catalogs-accounts-per-entity-DESIGN.md`): add `operating_company_id` (nullable→backfill→NOT NULL+FK), per-entity
   copies with new PKs, re-key all 5 FKs, drop global UNIQUEs → add `UNIQUE(operating_company_id, class_name)` /
   `(operating_company_id, class_code)` / `(operating_company_id, qbo_class_id)`, swap the role-only RLS for
   role **+ entity** scoping.
2. **RLS already exists but is role-only** — the migration must *replace* the `current_user_role() IS NOT NULL`
   predicate with an entity-scoped one (add `OR operating_company_id = current_setting('app.operating_company_id')`),
   not just "add RLS." Don't drop the role gate; AND it with the entity filter.
3. **Lower urgency than accounts** (all FKs nullable, classes is an optional dimension) — but do it in the SAME
   program so the two CoA-sibling leaks close together; a per-entity accounts CoA with still-global classes is
   half-decommingled.
4. **Sequencing vs accounts migration** — overlapping tables (`journal_entry_postings`, `banking_rules`,
   `posting_templates`, `items`), disjoint columns. Run as two tightly-sequenced migrations (accounts then classes,
   or one combined CoA-decommingle migration) so neither half-splits and they don't deadlock on shared tables.

---

## 4. Read-only LIVE introspection (Jorge runs on `br-fancy-credit-akjnd07a` — §1.5 gated)
Zero-write (READ ONLY + ROLLBACK). Coder does **not** self-connect to prod (§1.5; sibling `.env` prod string is
forbidden). Confirms the live FK list (catches prod-vs-repo drift) + row counts to size the backfill.

```sql
BEGIN;
SET TRANSACTION READ ONLY;
SET app.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'; -- TRANSP (so RLS counts don't lie)

-- (A) AUTHORITATIVE FK list: every FK column whose target is catalogs.classes
SELECT con.conname,
       (ns.nspname || '.' || rel.relname)            AS table_name,
       att.attname                                   AS column_name,
       (fns.nspname || '.' || frel.relname)          AS references_table
FROM pg_constraint con
JOIN pg_class      rel  ON rel.oid  = con.conrelid
JOIN pg_namespace  ns   ON ns.oid   = rel.relnamespace
JOIN pg_class      frel ON frel.oid = con.confrelid
JOIN pg_namespace  fns  ON fns.oid  = frel.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute  att  ON att.attrelid = con.conrelid AND att.attnum = k.attnum
WHERE con.contype = 'f'
  AND fns.nspname = 'catalogs' AND frel.relname = 'classes'
ORDER BY table_name, column_name;

-- (B) catalogs.classes shape (entity column? which UNIQUEs?) + row count + RLS state
SELECT count(*) AS classes_rows FROM catalogs.classes;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='catalogs' AND table_name='classes'
ORDER BY ordinal_position;
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'catalogs.classes'::regclass AND contype IN ('u','p')   -- global UNIQUEs = the leak
ORDER BY conname;
SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE oid = 'catalogs.classes'::regclass;

-- (C) row counts per referencing table (sizes the re-key) + how many rows actually carry a class
SELECT 'catalogs.items (default_class_id set)'           t, count(*) c FROM catalogs.items WHERE default_class_id IS NOT NULL
UNION ALL SELECT 'catalogs.posting_templates (default_class_id set)', count(*) FROM catalogs.posting_templates WHERE default_class_id IS NOT NULL
UNION ALL SELECT 'accounting.banking_rules (then_class_id set)',      count(*) FROM accounting.banking_rules WHERE then_class_id IS NOT NULL
UNION ALL SELECT 'accounting.journal_entry_postings (class_id set)',  count(*) FROM accounting.journal_entry_postings WHERE class_id IS NOT NULL
UNION ALL SELECT 'catalogs.classes (parent_class_id set)',            count(*) FROM catalogs.classes WHERE parent_class_id IS NOT NULL
ORDER BY c DESC;

ROLLBACK;
```

**After Jorge runs it:** reconcile (A) against §2 (note any extra/missing FK), fill row counts from (C), confirm
(B) shows the global UNIQUEs + no entity column. **No migration until Jorge approves the complete classes re-key
list + per-entity ownership rule, sequenced with the accounts migration.** Posting flags stay OFF until both land.
