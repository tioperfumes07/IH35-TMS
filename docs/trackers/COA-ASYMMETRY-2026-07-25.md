# CoA `is_postable` asymmetry — OWNER-EYES (2026-07-25)

**Lane:** DOCS only · **Do NOT change any `is_postable` value.** CoA is owner/CPA domain — not under the Lists “same values on every entity” ruling.

## Frozen live counts (Neon `br-fancy-credit-akjnd07a`, lucia)

```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT c.code,
       count(*) FILTER (WHERE a.is_postable) AS postable,
       count(*) AS total
FROM catalogs.accounts a
JOIN org.companies c ON c.id = a.operating_company_id
GROUP BY 1
ORDER BY 1;
```

| Entity | Postable | Total | Notes |
|---|---:|---:|---|
| **TRK** | **947** | 948 | 1 non-postable |
| **TRANSP** | **389** | 391 | 2 non-postable |
| **USMCA** | **53** | 53 | all postable |

**Correction:** earlier “TRANSP 220 postable” did **not** reproduce. Freeze **947 / 389 / 53**.

## Diff by account_number (postable, non-deactivated)

| Direction | Count |
|---|---:|
| TRK postable numbers absent on TRANSP | **859** |
| TRANSP postable numbers absent on TRK | **132** |

### TRK-only postable by `account_type`

| account_type | TRK-only |
|---|---:|
| Asset | 597 |
| Liability | 112 |
| Expense | 91 |
| CostOfGoodsSold | 33 |
| OtherExpense | 12 |
| Income | 6 |
| Equity | 6 |
| OtherIncome | 2 |

### Sample TRK-only (first 15 by type/number)

Most of the TRK surplus is **QBO-cloned unit/trailer/accum-depreciation Asset sub-accounts** (`QBO-*` numbers), not shared GL control accounts. Examples:

| account_number | account_name | account_type |
|---|---|---|
| 1100 | Accounts Receivable | Asset |
| 13000-LEASE | Lease Receivable (Sales-Type) | Asset |
| QBO-100 | RV-Refrigerated Van-10337 | Asset |
| QBO-1027 | UNIT 121 | Asset |
| QBO-105 | FR-Factoring Reserves- | Asset |
| QBO-1150040012 | BA-Wells Fargo-3500 | Asset |

Full list: re-run the TRK-only query in block 13 of the coder packet (limit removed).

## Owner decision needed (do not auto-fix)

Per type/group, Jorge/CPA choose one of:

1. **Keep asymmetry** (TRK owns fleet/unit sub-accounts; TRANSP stays lean) — document as intentional.
2. **Seed missing control accounts** onto TRANSP/USMCA (named list only) — HELD migration later.
3. **Mark selected TRK `is_postable=false`** (headers / non-posting) — line-by-line HELD migration later.

**Reserve / holdback accounts:** Rule 19 — owner-manual only; agents must not create/reclassify/deactivate them.

## What this PR does / does not

| Does | Does not |
|---|---|
| Surfaces grouped diff + frozen counts | Toggle `is_postable` |
| GET `/api/v1/accounting/coa-asymmetry-report` + Chart of Accounts owner panel | Seed / delete / merge accounts |
| Adds read-only guard (`verify-coa-asymmetry-readonly`) | Claim Lists “same catalog” applies to CoA |
