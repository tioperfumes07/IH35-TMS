# MERGED ≠ APPLIED — ACCT-F07 + ACCT-F08 consumer FK pair (2026-07-25)

> **STATUS (refresh 2026-07-28): SCHEMA NEON-APPLIED · ACCT-LINK-05 STILL FAIL ON CATALOG DENSITY**
>
> Both HOLD PRs merged and consumer FK columns are live on Neon (`posting_batches.posting_template_id`,
> expense_lines category FK). **ACCT-LINK-05 remains FAIL** until `catalogs.posting_templates` is
> seeded (0 rows lucia 2026-07-28) and at least one batch stamps `posting_template_id`. Do not flip
> PASS on FK-exists alone. Templates are **per-entity** (LST-F03) — do NOT invent a second global
> scope; owner seeds in-app via Lists → Posting Templates.

## FINDING pair (single honesty surface — one PR)

| Spec | Manifest | Merged PR | Merge SHA | Held migration | Consumer |
|---|---|---|---|---|---|
| ACCT-F07 | ACCT-LINK-04 | [#3446](https://github.com/tioperfumes07/IH35-TMS/pull/3446) | `7a0c3614ea0802d08bb28c5ceb0c3667a44c9784` | `202608020000_acct_link_04_expense_lines_expense_category_fk.sql` | `accounting.expense_lines` → `catalogs.expense_categories` (same-entity composite FK) |
| ACCT-F08 | ACCT-LINK-05 | [#3444](https://github.com/tioperfumes07/IH35-TMS/pull/3444) | `1d90a17828cbeba353f4c89ef49d5a868f1aefb9` | `202607950000_posting_batches_template_link.sql` | `accounting.posting_batches` → `catalogs.posting_templates` (global FK + `source_template_code` stamp) |

**Lane:** FINANCIAL-HOLD · **Rule 13:** build-and-HOLD; owner Neon-apply only; no agent DDL on prod.

---

## Prod truth (Neon `br-fancy-credit-akjnd07a`, lucia bypass, 2026-07-25)

### ACCT-F07 — expense_categories

```
BEGIN; SET LOCAL app.bypass_rls='lucia';
-- inbound FK count (expect 0 until owner applies 202608020000):
SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid
  WHERE c.contype='f' AND t.relname='expense_categories';
-- consumer column (expect absent until apply):
SELECT count(*) FROM information_schema.columns
  WHERE table_schema='accounting' AND table_name='expense_lines'
    AND column_name='operating_company_id';
ROLLBACK;
```

- `catalogs.expense_categories`: 9 rows, per-entity (`company_scope` GUC), **0 inbound FKs on prod**
- `accounting.expense_lines`: no `operating_company_id`, no composite FK to category catalog
- Migration **absent** from prod `_system._schema_migrations` ledger

### ACCT-F08 — posting_templates

```
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT count(*) FROM information_schema.columns
  WHERE table_schema='catalogs' AND table_name='posting_templates'
    AND column_name='operating_company_id';  -- expect 0 (GLOBAL by design; owner Q on per-entity)
SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid
  WHERE c.contype='f' AND t.relname='posting_templates';  -- expect 0
SELECT count(*) FROM information_schema.columns
  WHERE table_schema='accounting' AND table_name='posting_batches'
    AND column_name='posting_template_id';  -- expect absent until apply
ROLLBACK;
```

- `catalogs.posting_templates`: 0 rows (true empty, lucia-verified), GLOBAL, role-gated, **0 inbound FKs**
- `accounting.posting_batches`: no `posting_template_id`, no `source_template_code` on prod
- Per-entity scoping of posting_templates is an **owner design question** — do NOT auto-scope (backbone Block-05 lesson)

---

## What merged on main (static guard scope — PASS)

| Check | F07 guard | F08 guard |
|---|---|---|
| Held migration file on main | `202608020000_acct_link_04…` | `202607950000_posting_batches_template_link.sql` |
| Registered in `.held-migrations.json` without `applied_on_prod:true` | ✓ | ✓ |
| Consumer write path wired (routes / posting engine) | `expenses.routes.ts`, `expense-category-catalog.ts`, QBO puller, WO copy | `posting-engine.service.ts`, `fuel-posting/poster.service.ts` |
| Static wiring verify-step | 1433 `verify-expense-category-fk-wired` | 1433 `verify-posting-batches-template-link` |
| MERGED≠APPLIED honesty verify-step | **1478** `verify-expense-categories-consumer-fk` | **1479** `verify-posting-templates-consumer-fk` |

Static PASS **does not** flip `docs/module-completion/accounting.json` items ACCT-LINK-04 / ACCT-LINK-05 to PASS.

---

## Owner Neon-apply ceremony (required before PASS)

1. Apply held migration on a Neon branch (Jorge hand — `ih35_app` cannot DDL)
2. Ledger-backfill `_system._schema_migrations` + `.held-migrations.json` → `applied_on_prod: true`
3. Re-prove with lucia bypass:
   - F07: inbound FK count on `expense_categories` ≥ 1; composite FK visible in `pg_constraint`
   - F08: `posting_batches.posting_template_id` column + FK to `posting_templates`; inbound FK count ≥ 1
4. Flip ACCT-LINK-04 / ACCT-LINK-05 to PASS in `accounting.json` with live evidence in same PR
5. Deploy SHA must match merge ancestry before economics density claims

---

## Forbidden until Neon-apply

- Claiming ACCT-LINK-04 or ACCT-LINK-05 PASS because PR merged or CI green
- Treating static guard PASS as prod FK density
- Re-authoring migrations (already merged — #3446 / #3444)
- Auto-scoping `posting_templates` per-entity without written owner decision

---

## Guards

| Script | verify-step | Purpose |
|---|---|---|
| `scripts/verify-expense-categories-consumer-fk.mjs` | 1478 | Static wiring (delegates) + manifest FAIL + held-not-applied honesty |
| `scripts/verify-posting-templates-consumer-fk.mjs` | 1479 | Static wiring (delegates) + manifest FAIL + held-not-applied honesty |

Companion static guards (pre-existing): `verify-expense-category-fk-wired.mjs`, `verify-posting-batches-template-link.mjs` (verify-step 1433).
