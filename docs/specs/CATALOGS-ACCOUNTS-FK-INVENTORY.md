# INVENTORY — every FK column referencing `catalogs.accounts(id)` (Tier-1 design prep, NO migration)

Companion to `docs/specs/catalogs-accounts-per-entity-DESIGN.md`. This is the **authoritative re-key surface**
the per-entity migration must touch. Two columns of truth:
- **Repo-derived (this doc, complete):** swept from ALL `db/migrations/*.sql` (not just 0010). 30 grep matches →
  **29 distinct FK columns across 20 tables** (one dup: `journal_entry_postings.account_id` is declared in both
  0092 and 0123 via `CREATE TABLE IF NOT EXISTS` — same table, one FK).
- **Live-derived (PENDING — §1.5 gated):** `pg_constraint` on prod branch `br-fancy-credit-akjnd07a` is the only
  authority for (a) FKs that exist in prod but not in migrations / vice-versa, (b) the conditional FK target in
  0074, and (c) per-table row counts. The read-only introspection SQL is in §4 for Jorge to run.

> Status: **design doc, Tier-3, no schema change.** No migration written or run. The #1516 design estimated
> "~25 cols / ~20 tables"; the exact repo count is **29 / 20** — this doc supersedes that estimate.

---

## 1. The enumerated list — `table.column → catalogs.accounts(id)`

`NN` = NOT NULL (load-bearing: every existing row MUST carry a valid account id, so these cannot be left
un-re-keyed — they are the ones that hard-fail a half-done backfill). Row counts filled from §4 live run.

### catalogs.* (6 cols / 4 tables)
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 1 | `catalogs.accounts.parent_account_id` | – | 0010:23 | **self-ref** — re-key WITHIN each entity's copy (hierarchy preserved by new ids) |
| 2 | `catalogs.items.default_income_account_id` | – | 0010:76 | |
| 3 | `catalogs.items.default_expense_account_id` | – | 0010:77 | |
| 4 | `catalogs.posting_templates.debit_account_id` | **NN** | 0010:121 | |
| 5 | `catalogs.posting_templates.credit_account_id` | **NN** | 0010:122 | |
| 6 | `catalogs.account_role_bindings.account_id` | **NN** | 0010:159 | |

### banking.* (4 cols / 3 tables)
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 7 | `banking.transaction_categories.coa_account_id` | – | 0074:27 | ⚠️ **conditional FK** — added to `catalogs.accounts` only `IF` it exists, `ELSIF accounting.accounts` exists points THERE. Live `pg_constraint` must confirm actual target. |
| 8 | `banking.bank_transactions.coa_account_id` | – | 0087:15 | |
| 9 | `banking.bank_transactions.suggested_account_id` | – | 0182:16 | |
| 10 | `banking.bank_accounts.ledger_account_id` | – | 0162:9 | |

### accounting.* (9 cols / 9 tables)
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 11 | `accounting.journal_entry_postings.account_id` | **NN** | 0092:27 / 0123:2465 | **THE ledger line.** declared twice (idempotent); one FK. Highest-risk re-key. |
| 12 | `accounting.banking_rules.then_account_id` | **NN** | 0186:75 | |
| 13 | `accounting.expense_category_account_map.account_id` | **NN** | 0218:22 | category→GL map (Block-21) |
| 14 | `accounting.bill_lines.account_id` | – | 0220:17 | ALTER ADD COLUMN + ADD CONSTRAINT |
| 15 | `accounting.invoice_lines.account_id` | – | 0221:36 | ALTER ADD COLUMN + ADD CONSTRAINT |
| 16 | `accounting.chart_of_accounts_roles.account_id` | **NN** | 0223:21 | |
| 17 | `accounting.escrow_accounts.coa_account_id` | **NN** | 0234:9 | |
| 18 | `accounting.bill_payments.cc_account_id` | – | 0391:2 | credit-card clearing |
| 19 | `accounting.expense_lines.expense_account_uuid` | – | 202606181400:29 | ALTER ADD COLUMN |

### payroll.* (1 col / 1 table)
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 20 | `payroll.driver_settlement_line_items.posting_account_id` | **NN** | 0233:51 | Block-22 driver settlement |

### fixed_assets.* (6 cols / 2 tables)
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 21 | `fixed_assets.asset_classes.default_asset_account_id` | – | 202606151600:21 | FH-1 |
| 22 | `fixed_assets.asset_classes.default_accum_depr_account_id` | – | 202606151600:22 | |
| 23 | `fixed_assets.asset_classes.default_depr_expense_account_id` | – | 202606151600:23 | |
| 24 | `fixed_assets.assets.asset_account_id` | – | 202606151600:48 | per-asset override |
| 25 | `fixed_assets.assets.accum_depr_account_id` | – | 202606151600:49 | |
| 26 | `fixed_assets.assets.depr_expense_account_id` | – | 202606151600:50 | |

### finance.* (3 cols / 1 table) — ⚠️ SCHEMA DRIFT
| # | table.column | NN | migration | notes |
|---|---|----|----|----|
| 27 | `finance.loans.gl_liability_account_id` | – | 202606160100:23 | FH-3 amortization |
| 28 | `finance.loans.gl_interest_expense_account_id` | – | 202606160100:24 | |
| 29 | `finance.loans.payment_account_id` | – | 202606160100:25 | cash/bank |

**Totals: 29 distinct FK columns across 20 tables** (catalogs 6/4, banking 4/3, accounting 9/9, payroll 1/1,
fixed_assets 6/2, finance 3/1). **8 are NOT NULL** (#4, #5, #6, #11, #12, #13, #16, #17, #20) — these are the
load-bearing re-keys that must all land in the same atomic op.

---

## 2. Flags for Jorge (drift / decisions before the migration)

1. **⚠️ `finance.*` schema drift vs §4.** CLAUDE.md §4 says "Schema is `accounting.*` (never `finance.*`)", but
   FH-3 (`202606160100`) created a real `finance.loans` table with 3 `catalogs.accounts` FKs. Either §4 is stale
   or FH-3 should have been `accounting.loans`. **Name both, ask which is canonical** (per §9). The re-key must
   cover `finance.loans` regardless; the schema-name decision is separate.
2. **⚠️ Conditional FK target (0074 `banking.transaction_categories`).** Its FK points to `catalogs.accounts`
   OR `accounting.accounts` depending on which existed at apply time. Live `pg_constraint` confirms the real
   target on prod — if it points at `accounting.accounts`, that's a *second* CoA table to reconcile.
3. **Sibling problem — `catalogs.classes`.** `journal_entry_postings.class_id` and `banking_rules.then_class_id`
   FK into `catalogs.classes` (NOT accounts, so not in the 29). But `catalogs.classes` is almost certainly the
   same global-namespace leak as accounts. **Likely needs the same per-entity treatment** — flag for a parallel
   inventory, do not silently fold into this migration.
4. **`journal_entry_postings.account_id` is the highest-risk re-key** — it's the live GL ledger line. Its row
   count (§4) sizes the entire de-risk window: near-empty now (posting flag OFF) = safe; any volume = much riskier.

---

## 3. What the live run must add (why repo ≠ authoritative)
- Any FK whose `confrelid = catalogs.accounts` that is **not** in the 29 (prod can lag/lead migrations — see the
  [Prod Migration-Deployment Drift] memory: prod schema ≠ migrations at scale).
- The **actual target** of the 0074 conditional FK.
- **Per-table row counts** + `catalogs.accounts` row count (≈50 expected) to size the backfill.
- Per-entity ownership signal (account_number prefix `TRK-`/`QBO-`, qbo_account_id) needed for §3.3 of the DESIGN.

---

## 4. Read-only LIVE introspection (Jorge runs on `br-fancy-credit-akjnd07a` — §1.5 gated)
Zero-write. Wrapped READ ONLY + ROLLBACK so it can never mutate. Paste into the Neon console (prod branch) or
`psql`. Coder does **not** self-connect to prod (§1.5; sibling `.env` prod string is forbidden).

```sql
BEGIN;
SET TRANSACTION READ ONLY;
SET app.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'; -- TRANSP (so RLS counts don't lie)

-- (A) AUTHORITATIVE FK list: every FK column whose target is catalogs.accounts
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
  AND fns.nspname = 'catalogs' AND frel.relname = 'accounts'
ORDER BY table_name, column_name;

-- (B) catalogs.accounts shape (entity column? global uniques?) + row count
SELECT count(*) AS accounts_rows FROM catalogs.accounts;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='catalogs' AND table_name='accounts'
ORDER BY ordinal_position;

-- (C) row counts per referencing table (sizes the re-key). Add/remove rows to match (A) if prod differs.
SELECT 'catalogs.posting_templates'        t, count(*) c FROM catalogs.posting_templates
UNION ALL SELECT 'catalogs.items',                count(*) FROM catalogs.items
UNION ALL SELECT 'catalogs.account_role_bindings', count(*) FROM catalogs.account_role_bindings
UNION ALL SELECT 'banking.transaction_categories', count(*) FROM banking.transaction_categories
UNION ALL SELECT 'banking.bank_transactions',      count(*) FROM banking.bank_transactions
UNION ALL SELECT 'banking.bank_accounts',          count(*) FROM banking.bank_accounts
UNION ALL SELECT 'accounting.journal_entry_postings', count(*) FROM accounting.journal_entry_postings
UNION ALL SELECT 'accounting.banking_rules',       count(*) FROM accounting.banking_rules
UNION ALL SELECT 'accounting.expense_category_account_map', count(*) FROM accounting.expense_category_account_map
UNION ALL SELECT 'accounting.bill_lines',          count(*) FROM accounting.bill_lines
UNION ALL SELECT 'accounting.invoice_lines',       count(*) FROM accounting.invoice_lines
UNION ALL SELECT 'accounting.chart_of_accounts_roles', count(*) FROM accounting.chart_of_accounts_roles
UNION ALL SELECT 'accounting.escrow_accounts',     count(*) FROM accounting.escrow_accounts
UNION ALL SELECT 'accounting.bill_payments',       count(*) FROM accounting.bill_payments
UNION ALL SELECT 'accounting.expense_lines',       count(*) FROM accounting.expense_lines
UNION ALL SELECT 'payroll.driver_settlement_line_items', count(*) FROM payroll.driver_settlement_line_items
UNION ALL SELECT 'fixed_assets.asset_classes',     count(*) FROM fixed_assets.asset_classes
UNION ALL SELECT 'fixed_assets.assets',            count(*) FROM fixed_assets.assets
UNION ALL SELECT 'finance.loans',                  count(*) FROM finance.loans
ORDER BY c DESC;

ROLLBACK;
```

**After Jorge runs it:** drop the (A) result into §1 to reconcile repo-vs-live (note any extra/missing FK), and
fill the row-count column from (C). Then the DESIGN's backfill/ownership rule (§3.3 there) can be finalized.
**Still no migration until Jorge approves the complete re-key list + ownership rule.**
