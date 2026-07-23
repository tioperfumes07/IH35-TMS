# Accounting live economics smoke checklist (19/22)

Owner-operated evidence pack for Accounting Full Audit Law. **No API mutation from CI** — this doc + guard lock the checklist structure and Neon read queries Jorge runs after deploy.

## Preconditions (before any smoke txn)

- [ ] Deploy SHA matches merged PR (`GET /api/v1/healthz/shallow` → `version`)
- [ ] Entity selected: TRANSP, TRK, or USMCA (one company per run)
- [ ] RLS bypass discipline: every Neon query in one transaction with `SELECT set_config('app.bypass_rls','lucia',true)`
- [ ] `accounting.chart_of_accounts_roles` ≥ 1 active row per entity before asserting GL posting (HOLD-NEON if 0)

## Desktop audit sources (must exist)

| File | Purpose |
|------|---------|
| `~/Desktop/IH35-CURSOR-AUDIT/modules/accounting.md` | Module deep audit + ranked blocks |
| `~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-live-usmca-2026-07-22.md` | Live USMCA click-through evidence |
| `~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-RANKED-PRS-6-12.md` | PR queue after 5/M |
| `~/Desktop/IH35-CURSOR-AUDIT/ACCOUNTING-N-OF-M-22-LOCKED-2026-07-22.md` | Locked N-of-22 scoreboard |

## Smoke A — Vendor bill with lines (no display-only tax lie)

1. Create vendor bill with one line; note header amount = line sum.
2. Bill detail shows lines + JE link (forward).
3. JE source-links return to bill (reverse).
4. All Transactions register lists bill with correct open amount.

**Neon after smoke (read-only):**

```sql
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);
SELECT count(*) AS bill_lines FROM accounting.bill_lines;
SELECT count(*) AS jes FROM accounting.journal_entries je
  JOIN accounting.journal_entry_postings jep ON jep.journal_entry_id = je.id
  WHERE jep.source_transaction_type = 'bill';
COMMIT;
```

## Smoke B — Record expense end-to-end

1. Record expense with vendor + category + payment account.
2. Expense detail shows vendor, JE, load/unit links where set.
3. Vendor detail → Expenses tab lists the row.

**Neon after smoke:**

```sql
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);
SELECT count(*) AS expenses FROM accounting.expenses;
SELECT count(*) AS expense_lines FROM accounting.expense_lines;
COMMIT;
```

## Smoke C — Pay bill (bank picker, not hardcoded)

1. Open unpaid bill → Pay Bill drawer (ParityDrawer, real bank account).
2. Bill payment list + register deep-link by reference id.

## Acceptance block (paste into PR when smoke passes)

```
ROOT CAUSE: [prior gap — zero live rows / unproven chain]
FIX: [smoke path exercised]
GUARD: verify-acct-live-economics-evidence-pack.mjs
LIVE PROOF: healthz sha + Neon row counts + screenshot path
REMAINING: HOLD-NEON coa roles if poster still blocked
```

## Related guards (repo)

- `scripts/verify-bill-detail-reverse.mjs` — bill detail lines + JE reverse
- `scripts/verify-mgmt-report-aging-drill.mjs` — A/R + A/P aging has_balance drill-through
- `scripts/verify-dualpath-08-recurring-transactions-redirect.mjs` — recurring transactions redirect
- Open PR #3241: `verify-acct-bill-total-tax-display-only.mjs` — bill total = line sum when tax display-only
