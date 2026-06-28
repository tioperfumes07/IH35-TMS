# Column Integrity Hardening Plan
**Status:** APPROVED-BUILD (Jorge 2026-06-28)  
**Branch:** `feat/column-integrity-hardening`  
**Author:** Cascade  

---

## Problem Statement

Recurring class of bugs: backend code references a column that does not exist in the live DB (or
exists in one entity's schema but not another's). Root causes:

1. Migrations added columns to existing tables via `ADD COLUMN` but the code was written before or
   after without a CI guard verifying the column name existed.
2. Column renames in migrations were not reflected in all SQL string literals in route files.
3. `catalogs.accounts` is not yet per-entity (AF-1 / #1528 HOLD) — COA lookups can silently return
   an account from the wrong operating company.
4. `verify-backend-column-references` existed but was scoped only to `identity.users` — the
   highest-risk financial tables were unguarded.
5. No boot-time column probe — a missing column is only discovered when a query is executed in prod.

---

## Audit Results (2026-06-28)

| Guard | Result |
|---|---|
| `verify-schema-parity` | ✅ 489 tables, 7,384 columns in baseline |
| `verify-referenced-tables-exist` | ✅ 0 missing table refs |
| `verify-phantom-relations` | ✅ 0 unknown phantoms (18 known-debt forward-refs documented) |
| `verify-enum-literals` | ✅ 33 enums, 0 invalid literals |
| `verify-mdata-insert-arity` | ✅ OK |
| `verify-maintenance-insert-column-drift` | ✅ OK |
| `verify-posting-idempotency` | ✅ UNIQUE guards present |
| `verify-backend-column-references` | ⚠️ Only scopes `identity.users` — financial tables unguarded |
| Live boot-time probe | ❌ Does not exist |
| Posting column contract | ❌ Does not exist |

**Confirmed column truth for `accounting.journal_entry_postings` (all sources merged):**
```
id, operating_company_id, journal_entry_uuid, line_sequence, account_id, class_id,
entity_uuid, debit_or_credit, amount_cents, description, created_at, updated_at,
source_transaction_type, source_transaction_id, source_transaction_line_id,
posting_batch_id, idempotency_key
```
(base: `0092_p5_d4_manual_journal_entries.sql`; extensions: `0195_accounting_posting_backbone_schema.sql`)

**Confirmed column truth for `accounting.journal_entries`:**
```
id, operating_company_id, entry_date, memo, status, source, created_by_user_id,
qbo_sync_pending, created_at, updated_at, idempotency_key, qbo_idempotency_key
```

---

## What Is Built (this PR)

### 1. `scripts/verify-financial-column-contracts.mjs` (NEW)
Expands `verify-backend-column-references` scope to all financial tables.

**Approach:** Parse every SQL template literal in backend route/service `.ts` files for the
following tables, extract referenced column names, cross-check against known-good column sets
derived from migrations. Fails if a column is referenced that has no migration origin.

**Tables covered:**
- `accounting.journal_entries`
- `accounting.journal_entry_postings`
- `accounting.prepaid_assets`
- `accounting.prepaid_amortization_rows`
- `banking.transaction_categories`
- `accounting.posting_batches`
- `accounting.transaction_source_links`

### 2. `scripts/verify-posting-column-contract.mjs` (NEW)
Dedicated guard for every file that writes to `accounting.journal_entry_postings`.

**Rules enforced:**
- Every `INSERT INTO accounting.journal_entry_postings` must include `operating_company_id`
  (entity-scope safety — prevents cross-entity posting).
- No reference to deprecated column names (`amount` without `_cents` suffix,
  `journal_entry_id` instead of `journal_entry_uuid`).
- Every INSERT must include `debit_or_credit` (the split model — not legacy `debit_cents`/`credit_cents`).
- Every INSERT must include `idempotency_key` (idempotency enforcement).

### 3. `apps/backend/src/accounting/startup-column-probe.ts` (NEW)
Boot-time column existence check. Called from the posting engine initializer.

**Behavior:**
- On first posting engine use, queries `information_schema.columns` for all required columns on
  `journal_entry_postings` and `journal_entries`.
- Throws a loud startup error if any required column is missing.
- Result is cached (runs once per process lifetime).
- Degrade-safe: if `DATABASE_URL` is not set (test env), probe is skipped.

### 4. `docs/specs/COLUMN-INTEGRITY-PLAN.md` (this file)

---

## Gating

- All guards added to `package.json` `verify:*` scripts and wired into `ci.yml`.
- **AF-1 (#1528) must merge before the per-entity COA guard** (Tier 2 item below) can be built.
- No migration changes in this PR. No flag changes. No posting code changes.

---

## Tier 2 (HOLD until AF-1 merges)

- **Per-entity COA audit guard:** Every `JOIN catalogs.accounts` in a posting path must also filter
  by `operating_company_id`. Currently blocked because `catalogs.accounts` is shared across
  entities — this check would produce false positives until AF-1 makes it per-entity.

---

## Known-Debt Forward-Refs (not fixed here, documented)

18 tables referenced in code that do not exist yet (insurance, fuel routing, team settlements,
Samsara positions, etc.) — all guarded with `to_regclass` degrade-safe checks. These are product
backlog items, not active bugs.
