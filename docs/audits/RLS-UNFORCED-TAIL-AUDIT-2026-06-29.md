# RLS Unforced-Tail Audit (2026-06-29)

**Type:** read-only audit (Tier-3). **Scope:** the "RLS-ENABLED but NOT FORCED" tail flagged in the
working instructions as *"an audit item, not a confirmed leak."* Determines the actual risk model and
sizes any follow-up FORCE work — does **not** itself force anything.

## The risk model (why FORCE matters — and when it does not)

Postgres RLS policies do **not** apply to a table's **owner** unless the table is also `FORCE`d.
So an unforced, RLS-enabled table leaks across entities **only if the runtime role `ih35_app`
queries it as the table owner**. If `ih35_app` is a **grantee** (not owner), RLS already applies to
its queries regardless of FORCE, and the unforced tail is **not** an app-level leak.

Evidence from the repo (suggestive, not conclusive):
- `docs/CLAUDE.md §15` documents `ih35_app` receiving `USAGE` + `SELECT/INSERT/UPDATE/DELETE`
  **grants** (migration 0065 + DEFAULT PRIVILEGES) — the grant model implies a **separate owner
  role**, with `ih35_app` as grantee.
- Migrations do not broadly `ALTER TABLE … OWNER TO ih35_app` (one incidental hit only).

**If `ih35_app` is grantee-only on prod, the unforced tail is low/no app-level leak risk.** The
financial tables were nonetheless `FORCE`d (#1588 + #1626) as defense-in-depth / because some were
owner-context risks — that precedent does not prove the whole tail leaks.

## ⚠️ Drift to reconcile (GUARD)
- Working instructions say **139** enabled-not-forced tables on **prod**.
- A **fresh-migrated DB** (CI/build model, ~667 tables) shows **390** enabled-not-forced.
- That ~251-table gap means **prod RLS state ≠ migration-declared RLS state** (prod has many more
  tables FORCEd than the migrations declare, or the two counts use different methodology). Either way
  it is a real drift signal worth confirming before any tail-FORCE migration is authored against the
  wrong baseline.

## Enumeration (fresh-migrated schema — 390 unforced, by schema)

All listed counts are RLS-enabled-but-not-forced; `opco` = has `operating_company_id`; `pol` = has ≥1 policy.

| schema | unforced | opco | pol | | schema | unforced | opco | pol |
|---|---|---|---|---|---|---|---|---|
| catalogs | 64 | 64 | 64 | | banking | 8 | 8 | 8 |
| safety | 46 | 46 | 46 | | reports | 8 | 7 | 8 |
| maintenance | 29 | 29 | 29 | | reference | 7 | 0 | 7 |
| **accounting** | **28** | **28** | **28** | | qbo_archive | 6 | 6 | 6 |
| dispatch | 19 | 18 | 19 | | identity | 5 | 3 | 5 |
| driver_finance | 19 | 19 | 19 | | qbo | 5 | 5 | 5 |
| mdata | 17 | 16 | 17 | | factor | 4 | 4 | 4 |
| compliance | 16 | 14 | 16 | | ifta | 4 | 1 | 4 |
| integrations | 16 | 16 | 16 | | … | (remaining schemas ≤4 each) | | |
| legal | 10 | 10 | 10 | | | | | |

Financial-cluster tail of interest: **`accounting` (28)**, **`driver_finance` (19)**, `banking` (8),
`factor` (4), `settlement`/`settlements` (4), `payroll`/`payroll_integration` (3) — all opco-scoped
with policies, so FORCE would be safe *if* owner-context risk exists.

## What GUARD must confirm (decides whether this becomes Tier-1 work)
1. **Table ownership on prod:** is `ih35_app` the **owner** of these tables, or a **grantee**?
   (`SELECT relname, relowner::regrole FROM pg_class …` for a sample across schemas.) This is the
   single fact that decides whether the tail is a real leak.
2. **The true prod unforced count** (139 vs the migrated 390) and which tables differ.

## Recommendation
- **If `ih35_app` is grantee-only:** the unforced tail is **not** an app-level cross-entity leak;
  close this as low-risk, no mass-FORCE migration needed (the financial FORCEs were defense-in-depth).
- **If `ih35_app` owns the tables:** author **batched Tier-1 FORCE migrations** (like #1626),
  financial/entity-scoped schemas first (`accounting`, `driver_finance`, `banking`, `factor`,
  `settlements`, `payroll*`), each literal `ENABLE`+`FORCE`, idempotent, with a per-batch
  regression guard (pattern: `scripts/verify-steps/76-verify-orphaned-relocated-tables-rls-forced.mjs`).

No tables forced in this PR — audit only.
